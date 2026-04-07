param(
  [string]$SpreadsheetId = "1Veinh7xcEHV_R2tvMd-3oIUt3_EqWYrQTWi211fpL-c",
  [int]$Gid = 0,
  [string]$OutputPath = "data/calendar.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$url = "https://docs.google.com/spreadsheets/d/$SpreadsheetId/export?format=csv&gid=$Gid"
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$bytes = $client.GetByteArrayAsync($url).GetAwaiter().GetResult()
$csvText = [System.Text.Encoding]::UTF8.GetString($bytes)
$csvLines = $csvText -split "`r?`n" | Where-Object { $_ -ne "" }
$dataLines = if ($csvLines.Count -gt 1) { $csvLines[1..($csvLines.Count - 1)] } else { @() }
$rows = $dataLines | ConvertFrom-Csv -Header @("Datum", "Vecka", "Veckodag", "Hos", "HamtningsLamning", "Anteckningar")

$items = foreach ($row in $rows) {
  $date = [datetime]::ParseExact($row.Datum, "yyyy-MM-dd", $null)
  [pscustomobject]@{
    datum = $row.Datum
    ar = $date.Year
    vecka = [int]$row.Vecka
    veckodag = $row.Veckodag
    hos = $row.Hos
    hamtningsLamning = $row.HamtningsLamning
    anteckningar = $row.Anteckningar
  }
}

$outputDirectory = Split-Path -Path $OutputPath -Parent
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$items | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Host "Skrev $($items.Count) rader till $OutputPath"
