import {
  File,
  FileJson,
  FileCode2,
  FileText,
  Image,
  TerminalSquare,
  BookOpen,
  Database,
  Binary,
  Video,
  Music,
  Folder,
  FolderOpen,
  Presentation,
  Table,
  type Icon
} from "lucide-svelte";

export interface IconConfig {
  icon: typeof Icon;
  color: string;
}

export const iconMap: Record<string, IconConfig> = {
  js: { icon: FileCode2, color: "#F7DF1E" },
  jsx: { icon: FileCode2, color: "#F7DF1E" },
  ts: { icon: FileCode2, color: "#3178C6" },
  tsx: { icon: FileCode2, color: "#3178C6" },
  vue: { icon: FileCode2, color: "#41B883" },
  svelte: { icon: FileCode2, color: "#FF3E00" },
  json: { icon: FileJson, color: "#FBC02D" },
  md: { icon: BookOpen, color: "#519ABA" },
  mdx: { icon: BookOpen, color: "#519ABA" },
  pdf: { icon: FileText, color: "#FF5252" },
  zip: { icon: Binary, color: "#757575" },
  tar: { icon: Binary, color: "#757575" },
  gz: { icon: Binary, color: "#757575" },
  rar: { icon: Binary, color: "#757575" },
  "7z": { icon: Binary, color: "#757575" },
  png: { icon: Image, color: "#4CAF50" },
  jpg: { icon: Image, color: "#4CAF50" },
  jpeg: { icon: Image, color: "#4CAF50" },
  gif: { icon: Image, color: "#4CAF50" },
  svg: { icon: Image, color: "#FFB13B" },
  webp: { icon: Image, color: "#4CAF50" },
  mp4: { icon: Video, color: "#F06292" },
  mkv: { icon: Video, color: "#F06292" },
  avi: { icon: Video, color: "#F06292" },
  mov: { icon: Video, color: "#F06292" },
  webm: { icon: Video, color: "#F06292" },
  mp3: { icon: Music, color: "#FF9800" },
  wav: { icon: Music, color: "#FF9800" },
  ogg: { icon: Music, color: "#FF9800" },
  flac: { icon: Music, color: "#FF9800" },
  html: { icon: FileCode2, color: "#E34F26" },
  htm: { icon: FileCode2, color: "#E34F26" },
  css: { icon: FileCode2, color: "#1572B6" },
  scss: { icon: FileCode2, color: "#CC6699" },
  less: { icon: FileCode2, color: "#1D365D" },
  db: { icon: Database, color: "#607D8B" },
  sql: { icon: Database, color: "#607D8B" },
  sqlite: { icon: Database, color: "#607D8B" },
  txt: { icon: FileText, color: "#9E9E9E" },
  log: { icon: FileText, color: "#9E9E9E" },
  doc: { icon: FileText, color: "#2B579A" },
  docx: { icon: FileText, color: "#2B579A" },
  xls: { icon: Table, color: "#217346" },
  xlsx: { icon: Table, color: "#217346" },
  csv: { icon: Table, color: "#217346" },
  ppt: { icon: Presentation, color: "#B7472A" },
  pptx: { icon: Presentation, color: "#B7472A" },
  sh: { icon: TerminalSquare, color: "#4CAF50" },
  bash: { icon: TerminalSquare, color: "#4CAF50" },
  exe: { icon: TerminalSquare, color: "#0078D7" },
};

export const defaultIcon: IconConfig = { icon: File, color: "#9E9E9E" };
export const emptyFolderIcon: IconConfig = { icon: Folder, color: "#B0BEC5" };
export const nonEmptyFolderIcon: IconConfig = { icon: FolderOpen, color: "#FFCA28" };

export function getFileIconConfig(filename: string, isDir: boolean, isEmptyDir: boolean): IconConfig {
  if (isDir) {
    return isEmptyDir ? emptyFolderIcon : nonEmptyFolderIcon;
  }
  const ext = filename.toLowerCase().split(".").pop() || "";
  return iconMap[ext] || defaultIcon;
}
