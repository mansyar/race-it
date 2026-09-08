# Junction connectivity probe on topdown-fixed.png (top-down, ~16.2 px/unit,
# origin 640,360). G=road-gray, N=grass-mint, T=table. Samples the shared
# edges between corners and their straight/start neighbors.
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("$PWD\topdown-fixed.png")
$ppu = 12.5  # pixels per world unit at camera height 50, fov 60, viewport 937

function Get-Class([System.Drawing.Color]$p) {
  if ([math]::Abs($p.R - $p.G) -lt 14 -and [math]::Abs($p.G - $p.B) -lt 14) { return 'G' } # road/white lines
  if ($p.G - $p.R -gt 8) { return 'N' }  # grass mint
  return 'T'                              # table
}

function Scan-Line($x0, $z0, $x1, $z1, $label) {
  $x0 = [double]$x0; $z0 = [double]$z0; $x1 = [double]$x1; $z1 = [double]$z1
  $row = ''
  $steps = 40
  for ($i = 0; $i -le $steps; $i++) {
    $wx = $x0 + ($x1 - $x0) * $i / $steps
    $wz = $z0 + ($z1 - $z0) * $i / $steps
    $px = [int][math]::Round(640 + $wx * $ppu)
    $py = [int][math]::Round(360 + $wz * $ppu)
    $row += Get-Class $bmp.GetPixel($px, $py)
  }
  Write-Output ("{0}: {1}" -f $label, $row)
}

# 1. Junction corner(3,3)@90 <-> start(4,3): shared edge x=-4, z in [-6,-4]
Scan-Line -4.1 -6.2 -3.9 -3.8 'J1 corner33/start E-edge '
# 2. Junction corner(3,6)@0 <-> straight(3,5): shared edge z=-1, x in [-6,-4]
Scan-Line -6.2 -1.05 -3.8 -0.95 'J2 corner36/col35 N-edge '
# 3. Junction corner(7,3)@180 <-> straight(7,4): shared edge z=-4, x in [2,4]
Scan-Line 1.8 -4.05 4.2 -3.95 'J3 corner73/col74 S-edge '
# 4. Junction corner(7,6)@270 <-> straight(6,6): shared edge x=+2, z in [0,2]
Scan-Line 1.95 0.2 2.05 1.8 'J4 corner76/str66 W-edge '
# 5. Sanity: loop interior (should be table)
Scan-Line -0.5 0 -0.5 0.5 'S1 interior              '
# 6. Sanity: top straight middle (should be road)
Scan-Line -1.5 -5 -0.5 -5 'S2 top-straight mid      '
$bmp.Dispose()



