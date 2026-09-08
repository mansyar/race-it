import { appReady } from './app';

const root = document.querySelector<HTMLDivElement>('#app');

if (root && appReady()) {
  root.textContent = 'RACE-IT';
}
