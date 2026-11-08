$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$publicDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend\public'
New-Item -ItemType Directory -Force -Path $publicDirectory | Out-Null

$navy = [System.Drawing.Color]::FromArgb(20, 52, 94)
$blue = [System.Drawing.Color]::FromArgb(39, 105, 212)
$green = [System.Drawing.Color]::FromArgb(64, 158, 111)
$muted = [System.Drawing.Color]::FromArgb(109, 126, 150)
$softBlue = [System.Drawing.Color]::FromArgb(236, 244, 255)
$white = [System.Drawing.Color]::White

function Draw-BrandArtwork {
    param([System.Drawing.Graphics]$Graphics, [single]$Scale, [bool]$IncludeWordmark)

    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $Graphics.ScaleTransform($Scale, $Scale)
    if ($IncludeWordmark) {
        $Graphics.TranslateTransform(16, 5)
    }

    $bluePen = [System.Drawing.Pen]::new($blue, 3.4)
    $navyPen = [System.Drawing.Pen]::new($navy, 3.4)
    $greenPen = [System.Drawing.Pen]::new($green, 3.2)
    $softPen = [System.Drawing.Pen]::new($softBlue, 1.6)
    $bluePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $bluePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $navyPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $navyPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $greenPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $greenPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $Graphics.DrawArc($softPen, 9, 8, 76, 65, 195, 150)
    $Graphics.DrawLine($bluePen, 20, 67, 25, 18)
    $Graphics.DrawLine($navyPen, 74, 67, 69, 18)
    $Graphics.DrawBezier($bluePen, 25, 18, 38, 21, 54, 29, 69, 18)
    $Graphics.DrawBezier($navyPen, 20, 67, 37, 61, 55, 62, 74, 67)
    $Graphics.DrawLine($bluePen, 47, 29, 47, 61)

    $ball = [System.Drawing.RectangleF]::new(54, 14, 23, 23)
    $Graphics.FillEllipse([System.Drawing.Brushes]::White, $ball)
    $Graphics.DrawEllipse($greenPen, $ball)
    $Graphics.DrawLine($greenPen, 66, 15, 60, 25)
    $Graphics.DrawLine($greenPen, 60, 25, 68, 34)
    $Graphics.DrawLine($greenPen, 57, 22, 73, 21)
    $Graphics.DrawBezier($bluePen, 48, 9, 52, 4, 58, 4, 64, 8)

    if ($IncludeWordmark) {
        $Graphics.DrawString('PROJETO', [System.Drawing.Font]::new('Segoe UI', 8, [System.Drawing.FontStyle]::Bold), [System.Drawing.SolidBrush]::new($muted), 97, 17)
        $Graphics.DrawString('Aluno / Atleta', [System.Drawing.Font]::new('Segoe UI', 22, [System.Drawing.FontStyle]::Bold), [System.Drawing.SolidBrush]::new($navy), 96, 29)
        $Graphics.DrawString('EDUCACAO / ESPORTE - MARACANAU, CEARA', [System.Drawing.Font]::new('Segoe UI', 7.5, [System.Drawing.FontStyle]::Regular), [System.Drawing.SolidBrush]::new($muted), 99, 67)
    }
}

$logoPath = Join-Path $publicDirectory 'logo-aluno-atleta.png'
$logoBitmap = [System.Drawing.Bitmap]::new(600, 172, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$logoGraphics = [System.Drawing.Graphics]::FromImage($logoBitmap)
Draw-BrandArtwork -Graphics $logoGraphics -Scale 1.8 -IncludeWordmark $true
$logoBitmap.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)
$logoGraphics.Dispose()
$logoBitmap.Dispose()

$iconPath = Join-Path $publicDirectory 'favicon.png'
$iconBitmap = [System.Drawing.Bitmap]::new(64, 64, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.Clear($white)
$iconGraphics.Dispose()
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.Clear([System.Drawing.Color]::Transparent)
$iconGraphics.FillEllipse([System.Drawing.SolidBrush]::new($softBlue), 2, 2, 60, 60)
Draw-BrandArtwork -Graphics $iconGraphics -Scale 0.63 -IncludeWordmark $false
$iconBitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$iconGraphics.Dispose()
$iconBitmap.Dispose()

Write-Output "Gerados: $logoPath e $iconPath"
