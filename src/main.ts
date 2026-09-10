import * as THREE from 'three';
import { appReady } from './app';
import { KARTS, MODELS, MUSIC, SCENERY, SFX } from './assets/manifest';
import { createAudioDirector } from './audio/audio-director';
import { installGestureGuards } from './gesture-guards';
import type { GridModel, PieceType } from './grid/grid-model';
import { GRID_SIZE } from './grid/grid-model';
import { deleteFromShelf, loadShelf, saveToShelf } from './grid/shelf-store';
import { TrackEditor } from './grid/track-editor';
import { loadOrSeedTrack, saveTrack } from './grid/track-store';
import { validateTrack } from './grid/track-validator';
import { createRacePresentation, type RacePresentation } from './presentation/race-presentation';
import { createRaceEngine, type RaceEngine } from './race/engine';
import { kartColorIndex, loadLineup, saveLineup } from './race/lineup';
import { extractLoopPath } from './race/path';
import { ConfettiBurst } from './render/confetti';
import { type BuildTool, handleCellTap } from './render/interaction';
import { KartRenderer } from './render/kart-meshes';
import { KartPreview } from './render/kart-preview';
import { fillPerfPattern } from './render/perf-harness';
import { applyPieceFeedback } from './render/piece-feedback-apply';
import { PieceRenderer } from './render/piece-renderer';
import { createBuildScene } from './render/scene';
import { SceneryRenderer } from './render/scenery-render';
import { PieceFeedback } from './render/toy-feedback';
import './style.css';
import { createBuildBar } from './ui/build-bar';
import { createCarPicker } from './ui/car-picker';
import { createCornerCluster } from './ui/corner-cluster';
import { createGoButton } from './ui/go-button';
import { readInstallEnv } from './ui/install-context';
import { createInstallHint } from './ui/install-hint';
import { createRaceHud } from './ui/race-hud';
import { createShelfOverlay } from './ui/shelf-overlay';
import { createTrafficLight } from './ui/traffic-light';
import { createTrophy } from './ui/trophy';

// Referenced so the production build emits every GLB/OGG for service-worker
// precaching; the race presentation and audio consume them at runtime.
const ASSET_URLS: readonly string[] = [
  ...Object.values(MODELS),
  ...Object.values(KARTS),
  ...Object.values(SCENERY),
  ...Object.values(SFX),
  ...Object.values(MUSIC),
];
void ASSET_URLS.length;

const root = document.querySelector<HTMLDivElement>('#app');

if (root && appReady()) {
  root.replaceChildren();
  root.style.width = '100vw';
  root.style.height = '100vh';

  const model: GridModel = loadOrSeedTrack();
  let editor = new TrackEditor(model);
  let tool: BuildTool = { kind: 'none' };
  let selectedType: PieceType | null = null;
  let presentation: RacePresentation | null = null;
  let raceEngine: RaceEngine | null = null;

  const pieces = new PieceRenderer();
  const karts = new KartRenderer();
  const confetti = new ConfettiBurst();
  const scenery = new SceneryRenderer();
  const feedback = new PieceFeedback();
  const audio = createAudioDirector();

  const rerender = (): void => {
    pieces.update(model.toSnapshot());
    scenery.update(model.toSnapshot());
    bar.setUndoEnabled(editor.canUndo());
    go.setValid(validateTrack(model).valid);
    if (validateTrack(model).valid) {
      saveTrack(model);
    }
  };

  const view = createBuildScene(root, (x, y) => {
    const result = handleCellTap(editor, tool, x, y);
    if (result === 'placed') {
      audio.playOneShot('place');
      feedback.notePlaced(y * GRID_SIZE + x);
    }
    if (result === 'removed') {
      audio.playOneShot('remove');
    }
    if (result === 'ignored' && tool.kind === 'piece') {
      // A piece tool on an occupied cell is blocked — gentle nope feedback.
      audio.playOneShot('nope');
    }
    rerender();
  });

  // Toddler-proof the play surface: no long-press context menus or callouts,
  // no double-tap/pinch zoom, and no native drag ghosts on the toy table.
  installGestureGuards(root);

  // Debug mode: `?perf` fills the whole board (worst case, 144 pieces) and
  // exposes renderer stats on the window for manual fps/draw-call measurement.
  if (new URLSearchParams(window.location.search).has('perf')) {
    fillPerfPattern(model);
    (window as unknown as Record<string, unknown>).__raceItPerf = () => ({
      ...view.renderer.info.render,
      kartMeshes: karts.group.children.length,
      confettiVisible: confetti.points.visible,
    });
  }

  // Debug mode: `?debug` exposes per-piece world transforms and road-level
  // vertex extents for in-engine geometry verification.
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__raceItDebug = {
      view,
      holderInfo: (index: number) => {
        const holder = pieces.group.children[index];
        if (!holder) {
          return null;
        }
        holder.updateWorldMatrix(true, true);
        const child = holder.children[0];
        return {
          holderRotY: holder.rotation.y,
          childRotY: child ? child.rotation.y : null,
          childPos: child ? [child.position.x, child.position.y, child.position.z] : null,
        };
      },
      pieces: () =>
        pieces.group.children.map((holder) => {
          holder.updateWorldMatrix(true, true);
          const parts: Array<{
            name: string;
            color: string;
            minX: number;
            maxX: number;
            minZ: number;
            maxZ: number;
          }> = [];
          holder.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if ((mesh as unknown as { isMesh?: boolean }).isMesh !== true || !mesh.geometry) {
              return;
            }
            const pos = mesh.geometry.getAttribute('position');
            if (!pos) return;
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const colored = mat as { color?: THREE.Color };
            const v = new THREE.Vector3();
            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minZ = Number.POSITIVE_INFINITY;
            let maxZ = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
              if (v.y > 0.1) continue;
              minX = Math.min(minX, v.x);
              maxX = Math.max(maxX, v.x);
              minZ = Math.min(minZ, v.z);
              maxZ = Math.max(maxZ, v.z);
            }
            parts.push({
              name: mesh.name,
              color: colored.color ? `#${colored.color.getHexString()}` : '?',
              minX: +minX.toFixed(2),
              maxX: +maxX.toFixed(2),
              minZ: +minZ.toFixed(2),
              maxZ: +maxZ.toFixed(2),
            });
          });
          return { holder: holder.position.toArray(), rotY: holder.rotation.y, parts };
        }),
      roadMap: (index: number) => {
        const holder = pieces.group.children[index];
        if (!holder) return null;
        holder.updateWorldMatrix(true, true);
        const N = 16;
        const grid: Array<Array<number>> = Array.from({ length: N }, () =>
          Array<number>(N).fill(0),
        );
        const v = new THREE.Vector3();
        holder.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if ((mesh as unknown as { isMesh?: boolean }).isMesh !== true || !mesh.geometry) return;
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const colored = mat as { color?: THREE.Color };
          const hex = colored.color ? colored.color.getHexString() : '';
          if (hex !== 'b0b2b5') return; // road-gray material only
          const pos = mesh.geometry.getAttribute('position');
          if (!pos) return;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            if (v.y > 0.1) continue;
            const gx = Math.floor(((v.x - holder.position.x) / 2 + 0.5) * N);
            const gz = Math.floor(((v.z - holder.position.z) / 2 + 0.5) * N);
            const row = grid[gz];
            if (gx >= 0 && gx < N && gz >= 0 && gz < N && row) {
              row[gx] = 1;
            }
          }
        });
        return grid.map((row) => row.join(''));
      },
    };
  }

  // Debug mode: `?race` runs a headless seeded race on the current track and
  // prints the result — end-to-end verification vehicle for the race engine.
  if (new URLSearchParams(window.location.search).has('race')) {
    try {
      const headless = createRaceEngine(extractLoopPath(model), { seed: 42 });
      headless.on('kartFinish', ({ index, time }) => {
        console.info(`[race] kart ${index} finished at ${time.toFixed(2)}s`);
      });
      headless.start();
      let guard = 0;
      while (!headless.karts.every((kart) => kart.finished) && guard < 60 * 60) {
        headless.tick(1 / 60);
        guard += 1;
      }
      console.info('[race] result', headless.result);
      console.info('[race] headless run complete');
      (window as unknown as Record<string, unknown>).__raceItRace = headless;
    } catch (error) {
      console.error('[race] track has no closed loop', error);
    }
  }

  const trafficLight = createTrafficLight();
  const raceHud = createRaceHud({
    onPause: () => {
      audio.playOneShot('click');
    },
    onResume: () => {
      audio.playOneShot('click');
    },
    onQuit: () => {
      audio.playOneShot('confirmB');
    },
  });
  const trophy = createTrophy({
    onAgain: () => {
      audio.playOneShot('confirmA');
    },
  });

  const setBuildUiVisible = (visible: boolean): void => {
    go.root.classList.toggle('hidden', !visible);
    bar.root.classList.toggle('hidden', !visible);
    cluster.root.classList.toggle('racing', !visible);
    if (visible) {
      installHint.show();
    } else {
      installHint.hide();
    }
  };

  const go = createGoButton({
    onBlockedTap: () => {
      audio.playOneShot('nope');
    },
    onGo: () => {
      audio.playOneShot('click');
      picker.setLineup(loadLineup());
      picker.show();
      renderKartPreviews();
      installHint.hide();
    },
  });

  const bar = createBuildBar({
    onPieceSelect: (type) => {
      audio.playOneShot('click');
      selectedType = selectedType === type ? null : type;
      tool = selectedType ? { kind: 'piece', type: selectedType } : { kind: 'none' };
      bar.setSelected(selectedType);
      if (selectedType) {
        bar.setRemoveActive(false);
        feedback.setRemoveMode(false);
      }
    },
    onUndo: () => {
      audio.playOneShot('click');
      editor.undo();
      rerender();
    },
    onRemoveToggle: () => {
      audio.playOneShot('click');
      const active = tool.kind !== 'remove';
      tool = active ? { kind: 'remove' } : { kind: 'none' };
      bar.setRemoveActive(active);
      feedback.setRemoveMode(active);
      if (active) {
        selectedType = null;
        bar.setSelected(null);
      }
    },
  });

  const shelf = createShelfOverlay({
    getEntries: () => loadShelf(),
    onSave: () => {
      const result = saveToShelf(model);
      if (result === 'saved') {
        audio.playOneShot('click');
      }
      return result;
    },
    onLoad: (id) => {
      const entry = loadShelf().find((candidate) => candidate.id === id);
      if (!entry) {
        return;
      }
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          model.setCell(x, y, entry.snapshot[y * GRID_SIZE + x] ?? null);
        }
      }
      editor = new TrackEditor(model);
      rerender();
      audio.playOneShot('click');
    },
    onDelete: (id) => {
      deleteFromShelf(id);
      audio.playOneShot('confirmB');
    },
    onClose: () => {},
  });

  const cluster = createCornerCluster({
    onShelf: () => {
      audio.playOneShot('click');
      shelf.open();
    },
    onMuteToggle: (muted) => {
      audio.setMuted(muted);
    },
    onClearConfirmed: () => {
      audio.playOneShot('confirmB');
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          model.setCell(x, y, null);
        }
      }
      editor = new TrackEditor(model);
      rerender();
    },
  });

  // Install hint: iOS Safari parents get a wordless Add-to-Home-Screen nudge;
  // every other environment renders nothing at all.
  const installHint = createInstallHint(readInstallEnv());
  // The build screen is the boot state; race transitions call hide()/show()
  // from here on.
  installHint.show();

  const picker = createCarPicker({
    onRace: (lineup) => {
      try {
        const path = extractLoopPath(model);
        const engine = createRaceEngine(path, { kartCount: lineup.karts.length });
        raceEngine = engine;
        // The picker picked WHICH colors race; remap kart slots so engine
        // kart i renders the chosen color's model (and trophy color word).
        const order = lineup.karts.map((color) => kartColorIndex[color]);
        karts.setKartOrder(order);
        engine.on('kartFinish', ({ index, time }) => {
          console.info(`[race] kart ${index} finished at ${time.toFixed(2)}s`);
          if (engine.karts.every((kart) => kart.finished)) {
            console.info('[race] result', engine.result);
            (window as unknown as Record<string, unknown>).__raceItRace = engine;
          }
        });
        presentation = createRacePresentation({
          engine,
          path,
          trafficLight,
          raceHud,
          trophy,
          confetti,
          karts,
          camera: view.camera,
          kartOrder: order,
          onBuildUiChange: setBuildUiVisible,
          onCountdownBeep: (step) => {
            audio.playCountdownBeep(step);
          },
          onGo: () => {
            audio.playOneShot('go');
          },
          audio,
        });
        // Leaving remove mode behind would leak build feedback into the race.
        feedback.setRemoveMode(false);
        bar.setRemoveActive(false);
        saveLineup(lineup);
        picker.hide();
        audio.playOneShot('confirmA');
        presentation.beginRace();
      } catch (error) {
        console.error('[race] cannot start race', error);
      }
    },
    onBack: () => {
      audio.playOneShot('click');
      picker.hide();
      installHint.show();
    },
    onToggle: () => {
      audio.playOneShot('click');
    },
  });

  // One shared WebGL canvas renders the four tinted kart previews; it sits
  // above the swatch grid and only paints when the picker is visible.
  const kartPreview = new KartPreview({ container: picker.getPreviewSlot() });
  const renderKartPreviews = (): void => {
    const rect = picker.getPreviewSlot().getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      kartPreview.render(rect.width, rect.height);
    }
  };
  kartPreview
    .load()
    .then(renderKartPreviews)
    .catch((error: unknown) => {
      console.error('Failed to load kart preview models', error);
    });
  window.addEventListener('resize', renderKartPreviews);

  const appUi = document.createElement('div');
  appUi.className = 'app-ui';
  appUi.append(
    cluster.root,
    go.root,
    bar.root,
    cluster.confirm,
    picker.root,
    installHint.root,
    shelf.root,
  );
  root.append(appUi);

  const raceUi = document.createElement('div');
  raceUi.className = 'race-ui';
  raceUi.append(trafficLight.root, raceHud.root, trophy.root);
  root.append(raceUi);

  go.setValid(validateTrack(model).valid);

  pieces
    .load()
    .then(() => {
      view.scene.add(pieces.update(model.toSnapshot()));
      return scenery.load();
    })
    .then(() => {
      view.scene.add(scenery.update(model.toSnapshot()));
    })
    .catch((error: unknown) => {
      console.error('Failed to load track pieces or scenery', error);
    });
  karts
    .load()
    .then(() => {
      view.scene.add(karts.group);
      view.scene.add(confetti.points);
    })
    .catch((error: unknown) => {
      console.error('Failed to load kart models', error);
    });

  // Single per-frame pass: build feedback (build mode only) plus race
  // presentation (owns engine ticking), then render (scene owns rAF).
  view.onFrame((dt) => {
    feedback.tick(dt);
    if (!raceEngine || raceEngine.state === 'idle') {
      applyPieceFeedback(pieces.group, feedback, feedback.time);
    }
    presentation?.update(dt);
  });

  // iOS audio unlock: the WebAudio context may only resume inside a user
  // gesture, so unlock on the very first touch anywhere (capture phase).
  window.addEventListener(
    'pointerdown',
    () => {
      audio.unlock();
    },
    { once: true, capture: true },
  );
  // Backgrounding: silence everything when the page hides, restore on return.
  window.addEventListener('pagehide', () => {
    window.removeEventListener('resize', renderKartPreviews);
    kartPreview.dispose();
    audio.suspendAll();
    view.dispose();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      audio.resumeAll();
    }
  });
}
