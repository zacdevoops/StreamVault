export interface ResolvedDownloadStream {
  url: string;
  ext?: string;
  container?: string;
  filesize?: number;
  quality?: string;
  height?: number;
  width?: number;
  bitrate?: number;
  headers?: Record<string, string>;
  title?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  description?: string;
  duration?: number;
  timestamp?: number;
  upload_date?: string;
  view_count?: number;
  like_count?: number;
  thumbnails?: {
    url?: string;
    width?: number;
    height?: number;
    id?: string;
    resolution?: string;
  }[];
}
