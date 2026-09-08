# Edge-by-edge road probe for the two failing corners at 1280x720 top-down.
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("$PWD\topdown-fixed.png")

function Get-Class([System.Drawing.Color]$p) {
  if ([math]::Abs($p.R - $p.G) -lt 14 -and [math]::Abs($p.G - $p.B) -lt 14) { return 'G' }
  if ($p.G - $p.R -gt 8) { return 'N' }
  return 'T'
}

function Scan-Line($x0, $z0, $x1, $z1, $label) {
  $x0 = [double]$x0; $z0 = [double]$z0; $x1 = [double]$x1; $z1 = [double]$z1
  $row = ''
  for ($i = 0; $i -le 24; $i++) {
    $wx = $x0 + ($x1 - $x0) * $i / 24
    $wz = $z0 + ($z1 - $z0) * $i / 24
    $px = [int][math]::Round(1000 + $wx * 16.2)
    $py = [int][math]::Round(468.5 + $wz * 16.2)
    $row += Get-Class $bmp.GetPixel($px, $py)
  }
  Write-Output ("{0}: {1}" -f $label, $row)
}

# corner (7,3)@180 cell x[2,4] z[-6,-4]
Scan-Line 2.1 -5.9 3.9 -6.1 'c73 N-edge (z=-6) '
Scan-Line 3.9 -5.9 4.1 -4.1 'c73 E-edge (x=4)  '
Scan-Line 2.1 -5.9 2.1 -4.1 'c73 W-edge (x=2)  '
# corner (7,6)@270 cell x[2,4] z[0,2]
Scan-Line 2.1 0.1 3.9 -0.1 'c76 N-edge (z=0)  '
Scan-Line 3.9 0.1 4.1 1.9 'c76 E-edge (x=4)  '
Scan-Line 2.1 0.1 2.1 1.9 'c76 W-edge (x=2)  '
$bmp.Dispose()

