import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@Injectable()
export class UploadsService {
  private readonly localDir: string;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
    this.localDir = join(process.cwd(), 'uploads');
    if (!existsSync(this.localDir)) {
      mkdirSync(this.localDir, { recursive: true });
    }
  }

  private cloudinaryReady() {
    return Boolean(
      this.config.get<string>('CLOUDINARY_CLOUD_NAME') &&
        this.config.get<string>('CLOUDINARY_API_KEY') &&
        this.config.get<string>('CLOUDINARY_API_SECRET'),
    );
  }

  async uploadImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Only jpeg, png, webp, and gif images are allowed',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image must be 5MB or smaller');
    }

    if (this.cloudinaryReady()) {
      const result = await this.uploadBuffer(file.buffer, file.originalname);
      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        storage: 'cloudinary' as const,
      };
    }

    return this.saveLocal(file);
  }

  private async saveLocal(file: Express.Multer.File) {
    const ext =
      EXT[file.mimetype] ||
      extname(file.originalname || '').toLowerCase() ||
      '.jpg';
    const name = `${randomUUID()}${ext}`;
    const path = join(this.localDir, name);
    await pipeline(Readable.from(file.buffer), createWriteStream(path));
    const publicBase =
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('APP_URL') ||
      `http://localhost:${this.config.get('PORT') ?? 4000}`;
    const url = `${publicBase.replace(/\/$/, '')}/uploads/${name}`;
    return {
      url,
      publicId: name,
      width: null,
      height: null,
      format: ext.replace('.', ''),
      bytes: file.size,
      storage: 'local' as const,
    };
  }

  private uploadBuffer(
    buffer: Buffer,
    filename?: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'fajara',
          resource_type: 'image',
          filename_override: filename,
          use_filename: Boolean(filename),
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }
}
