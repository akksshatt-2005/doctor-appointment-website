import fs from 'fs/promises';
import path from 'path';

/**
 * StorageProvider interface defining contract for file operations.
 */
class StorageProvider {
  /**
   * Upload file content to storage
   * @param {Buffer} fileBuffer 
   * @param {string} originalName 
   * @param {string} mimeType 
   * @returns {Promise<string>} File path or S3 key
   */
  async uploadFile(fileBuffer, originalName, mimeType) {
    throw new Error("Method 'uploadFile()' must be implemented.");
  }

  /**
   * Delete file from storage
   * @param {string} filePath 
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    throw new Error("Method 'deleteFile()' must be implemented.");
  }

  /**
   * Get public or signed URL for a file
   * @param {string} filePath 
   * @returns {Promise<string>}
   */
  async getFileUrl(filePath) {
    throw new Error("Method 'getFileUrl()' must be implemented.");
  }
}

/**
 * Local file system implementation of StorageProvider.
 */
class LocalStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    // Ensure upload directory exists
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create directory ${this.uploadDir}`, err);
    }
  }

  async uploadFile(fileBuffer, originalName, mimeType) {
    const filename = `${Date.now()}-${path.basename(originalName)}`;
    const destinationPath = path.join(this.uploadDir, filename);
    await fs.writeFile(destinationPath, fileBuffer);
    return destinationPath;
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async getFileUrl(filePath) {
    // Return relative URL for local server serving static files
    return `/uploads/${path.basename(filePath)}`;
  }
}

/**
 * Supabase Storage implementation of StorageProvider.
 */
class SupabaseStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.supabaseUrl = process.env.SUPABASE_URL || 'https://fhymxjgbflkjmvdicfwp.supabase.co';
    this.supabaseKey = process.env.SUPABASE_KEY;
    this.bucketName = process.env.SUPABASE_BUCKET || 'neuro-harmony-storage';
  }

  async uploadFile(fileBuffer, originalName, mimeType) {
    if (!this.supabaseKey) {
      throw new Error("SUPABASE_KEY environment variable is not configured. Add it to backend/.env");
    }
    const filename = `${Date.now()}-${path.basename(originalName)}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filename}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
        'Content-Type': mimeType || 'application/octet-stream'
      },
      body: fileBuffer
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Supabase Storage upload failed: ${response.statusText} - ${errText}`);
    }

    return filename;
  }

  async deleteFile(filePath) {
    if (!this.supabaseKey) return;
    const deleteUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${path.basename(filePath)}`;
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey
      }
    });
  }

  async getFileUrl(filePath) {
    const filename = path.basename(filePath);
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filename}`;
  }
}

// Factory to return configured storage provider
let activeProvider = null;

export function getStorageProvider() {
  if (activeProvider) return activeProvider;

  const providerType = process.env.STORAGE_PROVIDER || 'local';
  if (providerType === 'local') {
    activeProvider = new LocalStorageProvider();
  } else if (providerType === 'supabase') {
    activeProvider = new SupabaseStorageProvider();
  } else if (providerType === 's3') {
    // S3 Storage provider placeholder
    // In actual implementation we will do:
    // activeProvider = new S3StorageProvider();
    throw new Error("S3 storage provider not implemented yet. Use 'local' or 'supabase'.");
  } else {
    throw new Error(`Unsupported storage provider: ${providerType}`);
  }

  return activeProvider;
}
