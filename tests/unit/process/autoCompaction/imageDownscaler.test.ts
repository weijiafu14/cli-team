import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';

// Mock dependencies before importing module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

const mockMetadata = vi.fn();
const mockResize = vi.fn();
const mockToFile = vi.fn();

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: mockMetadata,
    resize: vi.fn(() => ({
      toFile: mockToFile,
    })),
  })),
}));

// Import after mocks
const { downscaleImageIfNeeded } = await import('@process/services/autoCompaction/imageDownscaler');

describe('downscaleImageIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns original path if file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await downscaleImageIfNeeded('/path/to/missing.png');
    expect(result).toBe('/path/to/missing.png');
  });

  it('returns original path for non-image file extensions', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const result = await downscaleImageIfNeeded('/path/to/file.txt');
    expect(result).toBe('/path/to/file.txt');
  });

  it('returns original path for .pdf files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const result = await downscaleImageIfNeeded('/path/to/document.pdf');
    expect(result).toBe('/path/to/document.pdf');
  });

  it('returns original path when image is within dimension limits', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 1024, height: 768 });

    const result = await downscaleImageIfNeeded('/path/to/small.png');
    expect(result).toBe('/path/to/small.png');
  });

  it('returns downscaled path when image exceeds dimension limit', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 3840, height: 2160 });
    mockToFile.mockResolvedValue(undefined);

    const result = await downscaleImageIfNeeded('/path/to/large.png');
    expect(result).toBe('/path/to/large_downscaled.png');
  });

  it('respects custom max dimension', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 1200, height: 900 });

    const result = await downscaleImageIfNeeded('/path/to/medium.jpg', 1000);
    expect(result).toBe('/path/to/medium_downscaled.jpg');
  });

  it('returns original path when only width exceeds limit', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 2500, height: 1000 });
    mockToFile.mockResolvedValue(undefined);

    const result = await downscaleImageIfNeeded('/path/to/wide.png');
    expect(result).toBe('/path/to/wide_downscaled.png');
  });

  it('returns original path when only height exceeds limit', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 1000, height: 2500 });
    mockToFile.mockResolvedValue(undefined);

    const result = await downscaleImageIfNeeded('/path/to/tall.png');
    expect(result).toBe('/path/to/tall_downscaled.png');
  });

  it('handles sharp errors gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockRejectedValue(new Error('corrupt image'));

    const result = await downscaleImageIfNeeded('/path/to/corrupt.png');
    expect(result).toBe('/path/to/corrupt.png');
  });

  it('supports .jpeg extension', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 800, height: 600 });

    const result = await downscaleImageIfNeeded('/path/to/photo.jpeg');
    expect(result).toBe('/path/to/photo.jpeg');
  });

  it('supports .webp extension', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockMetadata.mockResolvedValue({ width: 800, height: 600 });

    const result = await downscaleImageIfNeeded('/path/to/image.webp');
    expect(result).toBe('/path/to/image.webp');
  });
});
