# Reads the Supabase CLI access token from the Windows Credential Manager and
# runs SQL via the Supabase Management API (POST /v1/projects/{ref}/database/query).
# The token is never printed.
param(
    [Parameter(Mandatory = $true)][string]$SqlFile,
    [string]$ProjectRef = "hmxxqacnzxqpcheoeidn"
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredManSQLRunner {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);
    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);
    public static string Read(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return null;
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlob == IntPtr.Zero) return null;
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
            return System.Text.Encoding.UTF8.GetString(bytes);
        } finally { CredFree(ptr); }
    }
}
"@

$token = [CredManSQLRunner]::Read("Supabase CLI:access-token")
if (-not $token -or $token.Trim().Length -eq 0) {
    Write-Error "Could not read Supabase access token from credential manager"
    exit 1
}
$token = $token.Trim()

$sql = [string](Get-Content $SqlFile -Raw)

$body = @{ query = $sql } | ConvertTo-Json -Compress
$headers = @{
    "Authorization" = "Bearer $($token.Trim())"
    "Content-Type"  = "application/json"
}

$url = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
try {
    $resp = Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $body -UseBasicParsing
    $resp.Content
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $detail = $_.ErrorDetails.Message
    Write-Output "HTTP $status"
    if ($detail) { Write-Output $detail }
    exit 1
}
