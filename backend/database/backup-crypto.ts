import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export interface BackupManifest {
  version: string;
  createdAt: string;
  databaseName: string;
  sizeBytes: number;
  checksum: string;
  encrypted: boolean;
  encryptionAlgorithm: string;
  keyId: string;
}

const ALGORITHM = 'aes-256-gcm';

export async function generateEncryptionKey(): Promise<Buffer> {
  return randomBytes(32);
}

export async function encryptBackup(
  backupPath: string,
  key: Buffer
): Promise<string> {
  const fs = await import('fs');
  
  const inputData = fs.readFileSync(backupPath);
  const iv = randomBytes(16);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(inputData), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const outputPath = backupPath + '.enc';
  const outputData = Buffer.concat([iv, authTag, encrypted]);
  
  fs.writeFileSync(outputPath, outputData);
  
  return outputPath;
}

export async function decryptBackup(
  encryptedPath: string,
  key: Buffer
): Promise<string> {
  const fs = await import('fs');
  
  const fileData = fs.readFileSync(encryptedPath);
  
  const iv = fileData.subarray(0, 16);
  const authTag = fileData.subarray(16, 32);
  const encrypted = fileData.subarray(32);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  
  const outputPath = encryptedPath.replace('.enc', '.dec');
  fs.writeFileSync(outputPath, decrypted);
  
  return outputPath;
}

export function createBackupManifest(data: {
  databaseName: string;
  sizeBytes: number;
  checksum: string;
}): BackupManifest {
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    databaseName: data.databaseName,
    sizeBytes: data.sizeBytes,
    checksum: data.checksum,
    encrypted: true,
    encryptionAlgorithm: ALGORITHM,
    keyId: `backup-key-${Date.now()}`,
  };
}

export async function generateRecoveryReport(
  backupId: string,
  restoreTimeMs: number
): Promise<{
  backupId: string;
  restoreTimeMs: number;
  recoveryTimeObjective: number;
  recoveryPointObjective: number;
  timestamp: string;
}> {
  return {
    backupId,
    restoreTimeMs,
    recoveryTimeObjective: restoreTimeMs,
    recoveryPointObjective: 0,
    timestamp: new Date().toISOString(),
  };
}