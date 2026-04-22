import { pgPool } from './db/pool';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { generateEncryptionKey, encryptBackup, createBackupManifest, BackupManifest } from './backup-crypto';

interface BackupConfig {
  retentionDays: number;
  pointInTimeWindowDays: number;
  scheduleIntervalHours: number;
  s3Bucket: string;
  s3Region: string;
  enableCrossRegion Replication: boolean;
  secondaryS3Region?: string;
  secondaryS3Bucket?: string;
}

interface BackupMetadata {
  id: string;
  timestamp: string;
  databaseName: string;
  sizeBytes: number;
  checksum: string;
  encrypted: boolean;
  version: string;
  pointInTime: boolean;
}

class DatabaseBackupService {
  private config: BackupConfig;
  private s3Client: S3Client;
  private secondaryS3Client?: S3Client;
  private isRunning = false;
  private backupInterval?: NodeJS.Timeout;

  constructor(config: BackupConfig) {
    this.config = config;
    this.s3Client = new S3Client({ region: config.s3Region });
    
    if (config.enableCrossRegion Replication && config.secondaryS3Region && config.secondaryS3Bucket) {
      this.secondaryS3Client = new S3Client({ region: config.secondaryS3Region });
    }
  }

  async startAutomatedBackups(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    const intervalMs = this.config.scheduleIntervalHours * 60 * 60 * 1000;
    
    await this.performBackup();
    
    this.backupInterval = setInterval(async () => {
      try {
        await this.performBackup();
      } catch (error) {
        console.error('Automated backup failed:', error);
      }
    }, intervalMs);
    
    console.log(`Automated backups started. Interval: ${this.config.scheduleIntervalHours}h`);
  }

  stopAutomatedBackups(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = undefined;
    }
    this.isRunning = false;
  }

  async performBackup(options?: { pointInTime?: boolean; tags?: Record<string, string> }): Promise<BackupMetadata> {
    const timestamp = new Date().toISOString();
    const dbName = process.env.DATABASE_NAME || 'agenticpay';
    
    const pool = pgPool;
    const client = await pool.connect();
    
    try {
      const backupDir = `/tmp/backup-${timestamp}`;
      await client.query(`BACKUP TO '${backupDir}'`);
      
      const sizeBytes = await this.getDirectorySize(backupDir);
      const checksum = await this.calculateChecksum(backupDir);
      
      const encryptionKey = await generateEncryptionKey();
      const encryptedPath = await encryptBackup(backupDir, encryptionKey);
      
      const manifest: BackupManifest = {
        version: '1.0',
        createdAt: timestamp,
        databaseName: dbName,
        sizeBytes,
        checksum,
        encrypted: true,
        encryptionAlgorithm: 'AES-256-GCM',
        keyId: `backup-key-${timestamp}`,
      };
      
      const s3Key = `backups/${dbName}/${timestamp}/backup.dump.enc`;
      await this.uploadToS3(this.s3Client, this.config.s3Bucket, s3Key, encryptedPath, manifest);
      
      if (this.secondaryS3Client && this.config.secondaryS3Bucket) {
        const secondaryKey = `backups/${dbName}/${timestamp}/backup.dump.enc`;
        await this.uploadToS3(this.secondaryS3Client, this.config.secondaryS3Bucket, secondaryKey, encryptedPath, manifest);
      }
      
      const metadata: BackupMetadata = {
        id: `backup-${timestamp}`,
        timestamp,
        databaseName: dbName,
        sizeBytes,
        checksum,
        encrypted: true,
        version: manifest.version,
        pointInTime: options?.pointInTime ?? false,
      };
      
      console.log(`Backup completed: ${metadata.id}, Size: ${sizeBytes} bytes`);
      return metadata;
    } finally {
      client.release();
    }
  }

  async restoreFromBackup(backupId: string, targetTimestamp?: string): Promise<void> {
    const backupData = await this.findBackup(backupId, targetTimestamp);
    if (!backupData) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    
    const s3Key = `backups/${backupData.databaseName}/${backupData.timestamp}/backup.dump.enc`;
    const encryptedPath = await this.downloadFromS3(this.s3Client, this.config.s3Bucket, s3Key);
    
    const encryptionKey = await this.getEncryptionKey(backupData.keyId);
    const decryptedPath = await this.decryptBackup(encryptedPath, encryptionKey);
    
    const pool = pgPool;
    const client = await pool.connect();
    
    try {
      await client.query(`RESTORE FROM '${decryptedPath}'`);
      console.log(`Restore completed from backup: ${backupId}`);
    } finally {
      client.release();
    }
  }

  async verifyBackup(backupId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    const backupData = await this.findBackup(backupId);
    if (!backupData) {
      return { valid: false, errors: ['Backup not found'] };
    }
    
    try {
      const s3Key = `backups/${backupData.databaseName}/${backupData.timestamp}/backup.dump.enc`;
      await this.downloadFromS3(this.s3Client, this.config.s3Bucket, s3Key);
      
      const sizeMatches = backupData.sizeBytes > 0;
      if (!sizeMatches) {
        errors.push('Invalid backup size');
      }
    } catch (error) {
      errors.push(`Verification failed: ${error}`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  async listBackups(options?: { since?: string; until?: string }): Promise<BackupMetadata[]> {
    const results: BackupMetadata[] = [];
    
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: 'backups/',
      })
    );
    
    for (const item of response.Contents || []) {
      if (!item.Key) continue;
      
      const parts = item.Key.split('/');
      if (parts.length < 3) continue;
      
      const timestamp = parts[2];
      if (options?.since && timestamp < options.since) continue;
      if (options?.until && timestamp > options.until) continue;
      
      results.push({
        id: `backup-${timestamp}`,
        timestamp,
        databaseName: parts[1],
        sizeBytes: item.Size || 0,
        checksum: item.ETag || '',
        encrypted: true,
        version: '1.0',
        pointInTime: false,
      });
    }
    
    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private async uploadToS3(
    client: S3Client,
    bucket: string,
    key: string,
    filePath: string,
    manifest: BackupManifest
  ): Promise<void> {
    const fs = await import('fs');
    const fileContent = fs.readFileSync(filePath);
    const manifestContent = Buffer.from(JSON.stringify(manifest));
    
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ServerSideEncryption: 'AES256',
      })
    );
    
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key.replace('backup.dump.enc', 'manifest.json'),
        Body: manifestContent,
        ServerSideEncryption: 'AES256',
      })
    );
  }

  private async downloadFromS3(client: S3Client, bucket: string, key: string): Promise<string> {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    
    const tempPath = `/tmp/restore-${Date.now()}.dump.enc`;
    const fs = await import('fs');
    fs.writeFileSync(tempPath, response.Body as Buffer);
    
    return tempPath;
  }

  private async findBackup(backupId: string, timestamp?: string): Promise<(BackupManifest & { timestamp: string; keyId: string; databaseName: string; sizeBytes: number }) | null> {
    const prefix = timestamp 
      ? `backups/${backupId.replace('backup-', '')}/${timestamp}/manifest.json`
      : `backups/${backupId.replace('backup-', '')}/`;
    
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: prefix,
        MaxKeys: 1,
      })
    );
    
    if (!response.Contents || response.Contents.length === 0) {
      return null;
    }
    
    const manifestKey = response.Contents[0].Key;
    if (!manifestKey) return null;
    
    const manifestResponse = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: manifestKey,
      })
    );
    
    return JSON.parse(await manifestResponse.Body?.transformToString() || '{}');
  }

  private async getDirectorySize(path: string): Promise<number> {
    const fs = await import('fs');
    let size = 0;
    
    const stat = fs.statSync(path);
    if (stat.isFile()) {
      return stat.size;
    }
    
    const files = fs.readdirSync(path);
    for (const file of files) {
      const filePath = `${path}/${file}`;
      const fileStat = fs.statSync(filePath);
      if (fileStat.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        size += fileStat.size;
      }
    }
    
    return size;
  }

  private async calculateChecksum(path: string): Promise<string> {
    const crypto = await import('crypto');
    const fs = await import('fs');
    
    const hash = crypto.createHash('sha256');
    const fileBuffer = fs.readFileSync(path);
    hash.update(fileBuffer);
    
    return hash.digest('hex');
  }

  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    return generateEncryptionKey();
  }

  private async decryptBackup(encryptedPath: string, key: Buffer): Promise<string> {
    const decryptedPath = encryptedPath.replace('.enc', '.dec');
    return decryptedPath;
  }
}

export { DatabaseBackupService, BackupConfig, BackupMetadata };