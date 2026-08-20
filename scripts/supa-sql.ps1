param(
  [Parameter(Mandatory=$true)][string]$Sql
)
# Reads the Supabase CLI access token from Windows Credential Manager and
# calls the Management API SQL endpoint. NEVER prints the token.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SupaCred {
  [StructLayout(LayoutKind.Sequential)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
}
"@

function Get-SupaToken {
  $ptr = [IntPtr]::Zero
  if (-not [SupaCred]::CredRead("Supabase CLI:access-token", 1, 0, [ref]$ptr)) {
    throw "CredRead failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][SupaCred+CREDENTIAL])
    $blob = New-Object byte[] $cred.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $cred.CredentialBlobSize)
    # Supabase CLI stores the token as ASCII text
    return ([System.Text.Encoding]::ASCII.GetString($blob)).Trim()
  } finally {
    [SupaCred]::CredFree($ptr) | Out-Null
  }
}

$token = Get-SupaToken
$body = @{ query = $Sql } | ConvertTo-Json -Compress
try {
  $r = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/hmxxqacnzxqpcheoeidn/database/query' `
    -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
  $r | ConvertTo-Json -Depth 6 -Compress
} catch {
  $resp = $_.Exception.Response
  if ($resp) {
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $respBody = $reader.ReadToEnd()
    Write-Output "HTTP $([int]$resp.StatusCode): $respBody"
  } else {
    Write-Output "ERROR: $($_.Exception.Message)"
  }
}
