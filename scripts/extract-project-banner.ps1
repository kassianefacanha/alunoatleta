$ErrorActionPreference = 'Stop'
$downloads = Join-Path $env:USERPROFILE 'Downloads'
$source = Get-ChildItem -LiteralPath $downloads -Filter 'Projeto Aluno _ Atleta*pdf' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch 'login|cadastro' } |
    Select-Object -First 1 -ExpandProperty FullName
$output = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend\public\projeto-aluno-atleta-banner.png'

if (-not $source) {
    Write-Output 'PDF da marca oficial indisponível. A ilustração local existente será preservada.'
    exit 0
}

$bytes = [IO.File]::ReadAllBytes($source)
$pdf = [Text.Encoding]::ASCII.GetString($bytes)
$matches = [regex]::Matches($pdf, '/Subtype\s*/Image')

foreach ($match in $matches) {
    $streamStart = $pdf.IndexOf('stream', $match.Index)
    if ($streamStart -lt 0) { continue }
    $headerLength = [Math]::Min($streamStart - $match.Index, 600)
    $header = $pdf.Substring($match.Index, $headerLength)
    if (
        $header -notmatch '/Width\s+1516' -or
        $header -notmatch '/Height\s+472' -or
        $header -notmatch '/Filter\s*/DCTDecode' -or
        $header -notmatch '/ColorSpace\s*/DeviceGray' -or
        $header -notmatch '/Length\s+(\d+)'
    ) { continue }

    $length = [int]$Matches[1]
    $dataStart = $streamStart + 6
    if ($pdf.Substring($streamStart, 8).StartsWith("stream`r`n")) {
        $dataStart = $streamStart + 8
    }
    elseif ($pdf.Substring($streamStart, 7).StartsWith("stream`n")) {
        $dataStart = $streamStart + 7
    }
    if ($dataStart + $length -gt $bytes.Length) { continue }

    $jpeg = [System.Drawing.Bitmap]::new(
        [IO.MemoryStream]::new($bytes[$dataStart..($dataStart + $length - 1)])
    )
    $bitmap = [System.Drawing.Bitmap]::new(1516, 472)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.DrawImage($jpeg, 0, 0, 1516, 472)
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $jpeg.Dispose()
    Write-Output "Identidade visual original extraída: $output"
    exit 0
}

Write-Output 'Banner PNG original não encontrado nos PDFs atuais. A ilustração local existente será preservada.'
