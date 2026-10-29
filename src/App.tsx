import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { CentralViewport } from './components/CentralViewport';
import { RightPanel } from './components/RightPanel';
import { TerminalDrawer } from './components/TerminalDrawer';
import { SettingsModal } from './components/SettingsModal';
import { ExportLocationModal } from './components/ExportLocationModal';
import { OpeningSplash } from './components/BrandLogo';
import { Dashboard } from './components/Dashboard';
import { Splitter } from './components/Splitter';
import { usePanelLayout } from './core/panelLayout';
import {
  SequenceItem,
  ExportSettings,
  RenderState,
  LogEntry,
  FFmpegProgress,
} from '../electron/types';
import { generateFFmpegCommand, formatOutputFilename } from './core/ffmpegGenerator';
import { detectImageSequences } from './core/sequenceDetector';
import { DEFAULT_EXPORT_SETTINGS } from './core/presetsAndGuidance';
import { estimateMP4Output } from './core/mp4Estimator';
import {
  ProjectItem,
  ProjectFolder,
  ProjectTemplate,
  loadStoredProjects,
  saveStoredProjects,
  loadStoredFolders,
  saveStoredFolders,
} from './core/projectStore';
import {
  loadPersistedExportSettings,
  savePersistedExportSettings,
  loadPersistedUIState,
  savePersistedUIState,
  hasPersistedSession,
} from './core/cookieStore';

export const App: React.FC = () => {
  const initialUIState = useMemo(() => loadPersistedUIState(), []);

  // Resizable panel widths and terminal height (drag the splitters, double-click to reset)
  const panelLayout = usePanelLayout();

  // App navigation screen: always play the intro splash animation on fresh app load,
  // then transition to the stored screen (dashboard or editor).
  const [appScreen, setAppScreen] = useState<'splash' | 'dashboard' | 'editor'>('splash');

  // Theme state: restored from cookie
  const [theme, setTheme] = useState<'light' | 'dark'>(() => initialUIState.theme);

  // Projects & Folders state (persisted to localStorage)
  const [projects, setProjects] = useState<ProjectItem[]>(() => loadStoredProjects());
  const [folders, setFolders] = useState<ProjectFolder[]>(() => loadStoredFolders());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => initialUIState.activeProjectId
  );

  const initialActiveProject = useMemo(() => {
    const projs = loadStoredProjects();
    return projs.find((p) => p.id === initialUIState.activeProjectId) || null;
  }, [initialUIState.activeProjectId]);

  // Input source and sequence states (restored synchronously from active project if available)
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(
    () => initialActiveProject?.sequenceDirectory || initialUIState.currentDirectory
  );
  const [detectedSequences, setDetectedSequences] = useState<SequenceItem[]>(
    () =>
      initialActiveProject?.detectedSequences ||
      (initialActiveProject?.selectedSequence ? [initialActiveProject.selectedSequence] : [])
  );
  const [selectedSequence, setSelectedSequence] = useState<SequenceItem | null>(
    () => initialActiveProject?.selectedSequence || null
  );

  // Playback & Scrubber states
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(() => initialUIState.isLooping);

  // Unified Export Settings state (restored from active project if available, otherwise cookies)
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    initialActiveProject?.settings || loadPersistedExportSettings()
  );

  const { inPoint, outPoint, targetFramerate } = exportSettings;

  const setInPoint = (val: number) =>
    setExportSettings((prev) => ({ ...prev, inPoint: val }));
  const setOutPoint = (val: number) =>
    setExportSettings((prev) => ({ ...prev, outPoint: val }));
  const setTargetFramerate = (fps: number) =>
    setExportSettings((prev) => ({ ...prev, targetFramerate: fps }));

  // Render & Process state
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'idle',
    progress: {
      frame: 0,
      fps: 0,
      bitrate: 'N/A',
      totalSize: 'N/A',
      outTime: '00:00:00',
      speed: '0x',
      progressPercent: 0,
    },
  });

  // Logs & UI Triggers
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [exportLocationModal, setExportLocationModal] = useState<{
    open: boolean;
    mode: 'export' | 'select-only';
  }>({ open: false, mode: 'export' });
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [ffmpegInfo, setFFmpegInfo] = useState<{
    available: boolean;
    binaryPath: string;
    isBundled?: boolean;
    version?: string;
  } | null>(null);

  // Hidden folder input for Browser / HTML5 fallback when window.electronAPI is unavailable
  const browserFolderInputRef = useRef<HTMLInputElement | null>(null);
  const browserBlobFilesRef = useRef<Map<string, File>>(new Map());
  const browserRenderCancelledRef = useRef<boolean>(false);
  const lastBrowserDetectedRef = useRef<SequenceItem[]>([]);
  const pendingFolderContextRef = useRef<{
    fromDashboard: boolean;
    template?: ProjectTemplate;
    targetFolderId?: string | null;
  }>({ fromDashboard: false });
  const [pendingFolderAction, setPendingFolderAction] = useState<{
    type: 'native' | 'browser';
    dirPath?: string;
    files?: File[];
  } | null>(null);

  // Auto-transition from Opening Splash Screen to target screen (dashboard or active project editor)
  useEffect(() => {
    if (appScreen === 'splash') {
      const targetScreen = initialUIState.appScreen === 'editor' && initialUIState.activeProjectId
        ? 'editor'
        : 'dashboard';
      const timer = setTimeout(() => {
        setAppScreen(targetScreen);
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [appScreen, initialUIState]);

  // Persist projects & folders
  useEffect(() => {
    saveStoredProjects(projects);
  }, [projects]);

  useEffect(() => {
    saveStoredFolders(folders);
  }, [folders]);

  // Persist chosen export settings in cookies whenever they change
  useEffect(() => {
    savePersistedExportSettings(exportSettings);
  }, [exportSettings]);

  // Persist UI state in cookies whenever it changes
  useEffect(() => {
    savePersistedUIState({
      theme,
      appScreen: appScreen === 'splash' ? 'dashboard' : appScreen,
      activeProjectId,
      currentDirectory,
      selectedSequencePattern: selectedSequence?.pattern || null,
      isLooping,
    });
  }, [theme, appScreen, activeProjectId, currentDirectory, selectedSequence, isLooping]);

  // Synchronize document theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Initial FFmpeg query and IPC listeners
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFFmpegInfo().then((info) => {
        setFFmpegInfo(info);
        if (info.available) {
          addLog(
            'info',
            `FFmpeg initialized (${info.isBundled ? 'bundled' : 'custom'}): ${info.binaryPath}`
          );
        } else {
          addLog('warn', `FFmpeg binary not detected: ${info.error || 'Check path'}`);
        }
      });

      const unsubProgress = window.electronAPI.onProgress((progress: FFmpegProgress) => {
        setRenderState((prev) => ({
          ...prev,
          status: 'rendering',
          progress,
        }));
      });

      const unsubLog = window.electronAPI.onLog((log: LogEntry) => {
        setLogs((prev) => [...prev.slice(-300), log]);
      });

      return () => {
        unsubProgress();
        unsubLog();
      };
    } else {
      fetch('/api/ffmpeg-info')
        .then((r) => r.json())
        .then((info) => {
          setFFmpegInfo(info);
          if (info.available) {
            addLog('info', `FFmpeg initialized (local server): ${info.binaryPath}`);
          }
        })
        .catch(() => {});
    }
  }, []);

  const addLog = (level: LogEntry['level'], message: string) => {
    setLogs((prev) => [
      ...prev.slice(-300),
      {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ]);
  };

  // Sync changes to active project when editing in studio
  useEffect(() => {
    if (appScreen !== 'editor' || !activeProjectId) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          settings: exportSettings,
          updatedAt: Date.now(),
          thumbnailPath: selectedSequence?.sampleFilePath || p.thumbnailPath,
          sequenceDirectory: currentDirectory || p.sequenceDirectory,
          sequencePattern: selectedSequence?.pattern || p.sequencePattern,
          totalFrames: selectedSequence?.totalFrames || p.totalFrames,
          width: selectedSequence?.width || p.width,
          height: selectedSequence?.height || p.height,
          selectedSequence: selectedSequence || p.selectedSequence,
          detectedSequences:
            detectedSequences.length > 0 ? detectedSequences : p.detectedSequences,
        };
      })
    );
  }, [
    exportSettings,
    selectedSequence,
    detectedSequences,
    currentDirectory,
    activeProjectId,
    appScreen,
  ]);

  // When a new sequence is selected, initialize viewport & range
  const handleSelectSequence = (
    seq: SequenceItem,
    preserveSettings?: ExportSettings,
    keepSavedRange?: boolean
  ) => {
    setSelectedSequence(seq);
    setCurrentFrame(0);
    const maxIdx = Math.max(0, seq.filePaths.length - 1);
    setIsPlaying(false);

    if (activeProjectId) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === activeProjectId
            ? {
                ...p,
                selectedSequence: seq,
                sequencePattern: seq.pattern,
                sequenceDirectory: seq.directory || p.sequenceDirectory,
                totalFrames: seq.totalFrames,
                width: seq.width,
                height: seq.height,
                thumbnailPath: seq.sampleFilePath || p.thumbnailPath,
                updatedAt: Date.now(),
              }
            : p
        )
      );
    }

    setExportSettings((prev) => {
      const base = preserveSettings || prev;
      const nextIn = keepSavedRange
        ? Math.min(Math.max(0, base.inPoint || 0), maxIdx)
        : 0;
      const nextOut =
        keepSavedRange && base.outPoint > 0
          ? Math.min(Math.max(nextIn, base.outPoint), maxIdx)
          : maxIdx;
      return {
        ...base,
        inPoint: nextIn,
        outPoint: nextOut,
        customWidth: seq.width || base.customWidth,
        customHeight: seq.height || base.customHeight,
      };
    });

    addLog('info', `Selected sequence: ${seq.name} (${seq.totalFrames} frames)`);
  };

  // Helper: Measure image dimensions from a blob/data/media URL in the renderer
  const measureImageUrlDimensions = (
    url: string
  ): Promise<{ width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  // Scan a list of browser File objects (used in web browser mode or HTML5 drag-and-drop)
  const scanBrowserFiles = async (
    fileList: File[],
    overrideSettings?: ExportSettings
  ): Promise<SequenceItem | null> => {
    if (!fileList || fileList.length === 0) return null;

    const firstRel = (fileList[0] as any).webkitRelativePath || '';
    const folderLabel = firstRel ? firstRel.split('/')[0] : 'Selected Folder';
    setCurrentDirectory(folderLabel);
    addLog('info', `Scanning ${fileList.length} files from "${folderLabel}"...`);

    // Revoke previous object URLs to prevent browser memory leaks
    for (const oldUrl of browserBlobFilesRef.current.keys()) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {}
    }
    browserBlobFilesRef.current.clear();

    const entries = fileList.map((file) => {
      const blobUrl = URL.createObjectURL(file);
      browserBlobFilesRef.current.set(blobUrl, file);
      return {
        name: file.name,
        path: blobUrl,
        size: file.size,
      };
    });

    const detected = detectImageSequences(entries, folderLabel);
    if (detected.length > 0) {
      for (const seq of detected) {
        if (seq.sampleFilePath) {
          const dims = await measureImageUrlDimensions(seq.sampleFilePath);
          if (dims) {
            seq.width = dims.width;
            seq.height = dims.height;
            seq.aspectRatio = `${dims.width}:${dims.height}`;
          }
        }
      }

      setDetectedSequences(detected);
      handleSelectSequence(detected[0], overrideSettings);
      addLog('info', `Found ${detected.length} sequence(s) in ${folderLabel}`);
      return detected[0];
    } else {
      setDetectedSequences([]);
      setSelectedSequence(null);
      addLog('warn', 'No numbered image sequences (PNG, JPG, WebP, etc.) found in selected folder');
      return null;
    }
  };

  // Handle files chosen via hidden <input type="file" webkitdirectory multiple />
  const handleBrowserFolderFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    const ctx = pendingFolderContextRef.current;

    if (ctx.fromDashboard) {
      const initialSettings = ctx.template ? ctx.template.settings : exportSettings;
      const seq = await scanBrowserFiles(files, initialSettings);
      const detected = lastBrowserDetectedRef.current;
      const firstRel = (files[0] as any).webkitRelativePath || '';
      const folderBaseName = firstRel ? firstRel.split('/')[0] : 'Sequence Project';
      const now = Date.now();

      const newProj: ProjectItem = {
        id: `proj-${now}`,
        name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
        folderId: ctx.targetFolderId || null,
        status: 'draft',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        templateId: ctx.template?.id,
        templatePoint: ctx.template?.specificPoint,
        accentColor: ctx.template?.accentColor || '#0071E3',
        thumbnailPath: seq?.sampleFilePath,
        sequenceDirectory: folderBaseName,
        sequencePattern: seq?.pattern,
        totalFrames: seq?.totalFrames,
        width: seq?.width,
        height: seq?.height,
        selectedSequence: seq || undefined,
        detectedSequences: detected.length > 0 ? detected : (seq ? [seq] : []),
        settings: {
          ...initialSettings,
          inPoint: 0,
          outPoint: seq ? Math.max(0, seq.filePaths.length - 1) : 0,
          customWidth: seq?.width || initialSettings.customWidth,
          customHeight: seq?.height || initialSettings.customHeight,
        },
      };

      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      setExportSettings(newProj.settings);
      setAppScreen('editor');
    } else {
      requestOpenFolder({ type: 'browser', files });
    }
  };

  // Scan a directory
  const scanDirectoryPath = async (
    dirPath: string,
    overrideSettings?: ExportSettings,
    keepSavedRange?: boolean,
    preferredPattern?: string
  ): Promise<SequenceItem | null> => {
    setCurrentDirectory(dirPath);
    addLog('info', `Scanning directory: ${dirPath}...`);

    if (window.electronAPI) {
      const res = await window.electronAPI.scanDirectory(dirPath);
      if (res.success && res.sequences && res.sequences.length > 0) {
        setDetectedSequences(res.sequences);
        const match = preferredPattern
          ? res.sequences.find(
              (s) => s.pattern === preferredPattern || s.name === preferredPattern
            ) || res.sequences[0]
          : res.sequences[0];
        handleSelectSequence(match, overrideSettings, keepSavedRange);
        addLog('info', `Found ${res.sequences.length} sequence(s) in ${dirPath}`);
        return match;
      } else {
        if (!keepSavedRange) {
          setDetectedSequences([]);
          setSelectedSequence(null);
        }
        addLog('warn', res.error || 'No valid image sequences found in directory');
      }
    } else {
      try {
        const resp = await fetch(`/api/scan-directory?dir=${encodeURIComponent(dirPath)}`);
        const res = await resp.json();
        if (res.success && res.sequences && res.sequences.length > 0) {
          for (const seq of res.sequences) {
            if (seq.sampleFilePath && !seq.width) {
              const dims = await measureImageUrlDimensions(
                `/api/media?path=${encodeURIComponent(seq.sampleFilePath)}`
              );
              if (dims) {
                seq.width = dims.width;
                seq.height = dims.height;
                seq.aspectRatio = `${dims.width}:${dims.height}`;
              }
            }
          }
          setDetectedSequences(res.sequences);
          const match = preferredPattern
            ? res.sequences.find(
                (s) => s.pattern === preferredPattern || s.name === preferredPattern
              ) || res.sequences[0]
            : res.sequences[0];
          handleSelectSequence(match, overrideSettings, keepSavedRange);
          addLog('info', `Found ${res.sequences.length} sequence(s) in ${dirPath}`);
          return match;
        } else if (!keepSavedRange) {
          setDetectedSequences([]);
          setSelectedSequence(null);
        }
      } catch {}
    }
    return null;
  };

  // Restore last opened sequence directory from cookies/project on page reload
  useEffect(() => {
    const proj = projects.find((p) => p.id === activeProjectId);
    const dirToRestore = proj?.sequenceDirectory || initialUIState.currentDirectory;
    const patternToRestore = proj?.sequencePattern || initialUIState.selectedSequencePattern;

    if (
      proj?.selectedSequence &&
      !selectedSequence &&
      !proj.selectedSequence.filePaths?.some((fp) => fp.startsWith('blob:'))
    ) {
      setSelectedSequence(proj.selectedSequence);
    }
    if (
      proj?.detectedSequences &&
      proj.detectedSequences.length > 0 &&
      detectedSequences.length === 0 &&
      !proj.detectedSequences[0]?.filePaths?.some((fp) => fp.startsWith('blob:'))
    ) {
      setDetectedSequences(proj.detectedSequences);
    }

    if (
      dirToRestore &&
      (dirToRestore.includes('\\') ||
        dirToRestore.includes('/') ||
        dirToRestore === '__SAMPLE_SEQUENCE__')
    ) {
      scanDirectoryPath(
        dirToRestore,
        proj?.settings || exportSettings,
        true,
        patternToRestore || undefined
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Dashboard Project & Folder Handlers ---

  const handleOpenProject = async (project: ProjectItem) => {
    setActiveProjectId(project.id);
    setExportSettings(project.settings);
    setRenderState((prev) => ({
      ...prev,
      status: project.exportedFilePath ? 'completed' : 'idle',
      outputPath: project.exportedFilePath,
      outputSizeBytes: project.exportedSizeBytes,
    }));

    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id ? { ...p, lastOpenedAt: Date.now() } : p
      )
    );

    if (project.selectedSequence) {
      setSelectedSequence(project.selectedSequence);
      if (project.detectedSequences && project.detectedSequences.length > 0) {
        setDetectedSequences(project.detectedSequences);
      }
    }

    if (project.sequenceDirectory) {
      await scanDirectoryPath(
        project.sequenceDirectory,
        project.settings,
        true,
        project.sequencePattern
      );
    } else if (!project.selectedSequence) {
      setCurrentDirectory(null);
      setDetectedSequences([]);
      setSelectedSequence(null);
    }

    setAppScreen('editor');
  };

  const openBrowserFolderPicker = (ctx: {
    fromDashboard: boolean;
    template?: ProjectTemplate;
    targetFolderId?: string | null;
  }) => {
    pendingFolderContextRef.current = ctx;
    const input = browserFolderInputRef.current;
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const handleCreateNewProjectFromFolder = async (
    template?: ProjectTemplate,
    targetFolderId?: string | null
  ) => {
    const initialSettings = template ? template.settings : exportSettings;

    if (!window.electronAPI) {
      openBrowserFolderPicker({
        fromDashboard: true,
        template,
        targetFolderId,
      });
      return;
    }

    const selectedDir = await window.electronAPI.selectDirectory('Select Image Sequence Folder');
    if (!selectedDir) return;

    const seq = await scanDirectoryPath(selectedDir, initialSettings);
    const folderBaseName =
      selectedDir.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'Sequence Project';
    const now = Date.now();

    const newProj: ProjectItem = {
      id: `proj-${now}`,
      name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
      folderId: targetFolderId || null,
      status: 'draft',
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      templateId: template?.id,
      templatePoint: template?.specificPoint,
      accentColor: template?.accentColor || '#0071E3',
      thumbnailPath: seq?.sampleFilePath,
      sequenceDirectory: selectedDir,
      sequencePattern: seq?.pattern,
      totalFrames: seq?.totalFrames,
      width: seq?.width,
      height: seq?.height,
      selectedSequence: seq || undefined,
      detectedSequences:
        detectedSequences.length > 0 ? detectedSequences : seq ? [seq] : [],
      settings: {
        ...initialSettings,
        inPoint: 0,
        outPoint: seq ? Math.max(0, seq.filePaths.length - 1) : 0,
        customWidth: seq?.width || initialSettings.customWidth,
        customHeight: seq?.height || initialSettings.customHeight,
      },
    };

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setExportSettings(newProj.settings);
    setAppScreen('editor');
  };

  const handleCreateProjectFromTemplate = (
    template: ProjectTemplate,
    targetFolderId?: string | null
  ) => {
    const now = Date.now();
    const newProj: ProjectItem = {
      id: `proj-${now}`,
      name: template.name,
      folderId: targetFolderId || null,
      status: 'draft',
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      templateId: template.id,
      templatePoint: template.specificPoint,
      accentColor: template.accentColor,
      settings: template.settings,
    };

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setExportSettings(template.settings);
    setCurrentDirectory(null);
    setDetectedSequences([]);
    setSelectedSequence(null);
    setAppScreen('editor');
  };

  const handleRenameProject = (projectId: string, newName: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, name: newName, updatedAt: Date.now() } : p
      )
    );
  };

  const handleCopyProject = (projectId: string) => {
    const orig = projects.find((p) => p.id === projectId);
    if (!orig) return;
    const now = Date.now();
    const copy: ProjectItem = {
      ...orig,
      id: `proj-${now}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${orig.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    setProjects((prev) => [copy, ...prev]);
  };

  const handleMoveProjectToFolder = (projectId: string, folderId: string | null) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, folderId, updatedAt: Date.now() } : p
      )
    );
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() }
          : p
      )
    );
  };

  const handleRestoreProject = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, isDeleted: false, deletedAt: undefined, updatedAt: Date.now() }
          : p
      )
    );
  };

  const handlePermanentDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const handleEmptyTrash = () => {
    setProjects((prev) => prev.filter((p) => !p.isDeleted));
  };

  const handleCreateFolder = (
    name: string,
    color = '#2563EB',
    parentId?: string | null
  ): ProjectFolder => {
    const now = Date.now();
    const folder: ProjectFolder = {
      id: `fld-${now}`,
      name,
      color,
      parentId: parentId || null,
      createdAt: now,
      updatedAt: now,
    };
    setFolders((prev) => [...prev, folder]);
    return folder;
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, name: newName, updatedAt: Date.now() } : f
      )
    );
  };

  const handleMoveFolder = (folderId: string, targetParentId: string | null) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, parentId: targetParentId, updatedAt: Date.now() } : f
      )
    );
  };

  const handleDeleteFolder = (folderId: string) => {
    const getDescendants = (pid: string, all: ProjectFolder[]): string[] => {
      const kids = all.filter((f) => f.parentId === pid);
      return kids.flatMap((k) => [k.id, ...getDescendants(k.id, all)]);
    };

    setFolders((prev) => {
      const toRemove = new Set([folderId, ...getDescendants(folderId, prev)]);
      return prev.filter((f) => !toRemove.has(f.id));
    });

    setProjects((prev) =>
      prev.map((p) => (p.folderId === folderId ? { ...p, folderId: null } : p))
    );
  };

  const handleDeleteFolderChildren = (folderId: string) => {
    const getDescendants = (pid: string, all: ProjectFolder[]): string[] => {
      const kids = all.filter((f) => f.parentId === pid);
      return kids.flatMap((k) => [k.id, ...getDescendants(k.id, all)]);
    };

    const subfolderIds = new Set(getDescendants(folderId, folders));
    const allAffectedIds = new Set([folderId, ...subfolderIds]);

    // Remove all descendant subfolders
    setFolders((prev) => prev.filter((f) => !subfolderIds.has(f.id)));

    // Move all projects inside this folder and descendant folders to trash
    const now = Date.now();
    setProjects((prev) =>
      prev.map((p) =>
        p.folderId && allAffectedIds.has(p.folderId)
          ? { ...p, isDeleted: true, deletedAt: now, updatedAt: now }
          : p
      )
    );
  };

  const handleMoveFolderProjects = (sourceFolderId: string, targetFolderId: string | null) => {
    const now = Date.now();
    setProjects((prev) =>
      prev.map((p) =>
        p.folderId === sourceFolderId
          ? { ...p, folderId: targetFolderId, updatedAt: now }
          : p
      )
    );
  };

  // Request opening a new folder — checks if existing sequence/files are loaded
  const requestOpenFolder = (target: { type: 'native'; dirPath?: string } | { type: 'browser'; files?: File[] }) => {
    const hasExistingContent = Boolean(selectedSequence || currentDirectory || detectedSequences.length > 0);
    const isSameDirectory = target.type === 'native' && target.dirPath === currentDirectory;

    if (!hasExistingContent || isSameDirectory) {
      if (target.type === 'native' && target.dirPath) {
        scanDirectoryPath(target.dirPath);
      } else if (target.type === 'browser' && target.files) {
        scanBrowserFiles(target.files);
      }
      return;
    }

    setPendingFolderAction(target);
  };

  const handleOverwritePendingFolder = async () => {
    if (!pendingFolderAction) return;
    const action = pendingFolderAction;
    setPendingFolderAction(null);

    if (action.type === 'native' && action.dirPath) {
      const seq = await scanDirectoryPath(action.dirPath);
      if (activeProjectId) {
        const folderBaseName = action.dirPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'Sequence Project';
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== activeProjectId) return p;
            return {
              ...p,
              name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
              sequenceDirectory: action.dirPath,
              sequencePattern: seq?.pattern,
              totalFrames: seq?.totalFrames,
              width: seq?.width,
              height: seq?.height,
              thumbnailPath: seq?.sampleFilePath,
              selectedSequence: seq || undefined,
              detectedSequences:
                detectedSequences.length > 0 ? detectedSequences : seq ? [seq] : [],
              updatedAt: Date.now(),
            };
          })
        );
      }
    } else if (action.type === 'browser' && action.files) {
      const seq = await scanBrowserFiles(action.files);
      if (activeProjectId) {
        const firstRel = (action.files[0] as any).webkitRelativePath || '';
        const folderBaseName = firstRel ? firstRel.split('/')[0] : 'Sequence Project';
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== activeProjectId) return p;
            return {
              ...p,
              name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
              sequencePattern: seq?.pattern,
              totalFrames: seq?.totalFrames,
              width: seq?.width,
              height: seq?.height,
              selectedSequence: seq || undefined,
              detectedSequences:
                detectedSequences.length > 0 ? detectedSequences : seq ? [seq] : [],
              updatedAt: Date.now(),
            };
          })
        );
      }
    }
  };

  const handleSaveAndCreateNewPendingFolder = async () => {
    if (!pendingFolderAction) return;
    const action = pendingFolderAction;
    setPendingFolderAction(null);

    const now = Date.now();

    // 1. Ensure existing project is saved
    if (activeProjectId) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            settings: exportSettings,
            thumbnailPath: selectedSequence?.sampleFilePath || p.thumbnailPath,
            sequenceDirectory: currentDirectory || p.sequenceDirectory,
            sequencePattern: selectedSequence?.pattern || p.sequencePattern,
            totalFrames: selectedSequence?.totalFrames || p.totalFrames,
            width: selectedSequence?.width || p.width,
            height: selectedSequence?.height || p.height,
            selectedSequence: selectedSequence || p.selectedSequence,
            detectedSequences:
              detectedSequences.length > 0 ? detectedSequences : p.detectedSequences,
            updatedAt: now,
          };
        })
      );
    } else if (selectedSequence) {
      const currentName = selectedSequence.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '');
      const savedProj: ProjectItem = {
        id: `proj-${now - 1}`,
        name: currentName,
        folderId: null,
        status: 'draft',
        isDeleted: false,
        createdAt: now - 1,
        updatedAt: now - 1,
        lastOpenedAt: now - 1,
        accentColor: '#0071E3',
        thumbnailPath: selectedSequence.sampleFilePath,
        sequenceDirectory: currentDirectory || undefined,
        sequencePattern: selectedSequence.pattern,
        totalFrames: selectedSequence.totalFrames,
        width: selectedSequence.width,
        height: selectedSequence.height,
        selectedSequence: selectedSequence || undefined,
        detectedSequences: detectedSequences.length > 0 ? detectedSequences : [],
        settings: exportSettings,
      };
      setProjects((prev) => [savedProj, ...prev]);
    }

    // 2. Scan new folder and create a brand new project
    if (action.type === 'native' && action.dirPath) {
      const selectedDir = action.dirPath;
      const seq = await scanDirectoryPath(selectedDir, DEFAULT_EXPORT_SETTINGS);
      const folderBaseName = selectedDir.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'Sequence Project';
      const newProjId = `proj-${now}`;
      const newProj: ProjectItem = {
        id: newProjId,
        name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
        folderId: null,
        status: 'draft',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        accentColor: '#0071E3',
        thumbnailPath: seq?.sampleFilePath,
        sequenceDirectory: selectedDir,
        sequencePattern: seq?.pattern,
        totalFrames: seq?.totalFrames,
        width: seq?.width,
        height: seq?.height,
        selectedSequence: seq || undefined,
        detectedSequences: detectedSequences.length > 0 ? detectedSequences : (seq ? [seq] : []),
        settings: {
          ...DEFAULT_EXPORT_SETTINGS,
          inPoint: 0,
          outPoint: seq ? Math.max(0, seq.filePaths.length - 1) : 0,
          customWidth: seq?.width || DEFAULT_EXPORT_SETTINGS.customWidth,
          customHeight: seq?.height || DEFAULT_EXPORT_SETTINGS.customHeight,
        },
      };
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProjId);
      setExportSettings(newProj.settings);
    } else if (action.type === 'browser' && action.files) {
      const seq = await scanBrowserFiles(action.files, DEFAULT_EXPORT_SETTINGS);
      const firstRel = (action.files[0] as any).webkitRelativePath || '';
      const folderBaseName = firstRel ? firstRel.split('/')[0] : 'Sequence Project';
      const newProjId = `proj-${now}`;
      const newProj: ProjectItem = {
        id: newProjId,
        name: seq ? seq.name.replace(/\s*\(\.[A-Z0-9]+\)$/i, '') : folderBaseName,
        folderId: null,
        status: 'draft',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        accentColor: '#0071E3',
        totalFrames: seq?.totalFrames,
        sequencePattern: seq?.pattern,
        width: seq?.width,
        height: seq?.height,
        selectedSequence: seq || undefined,
        detectedSequences: detectedSequences.length > 0 ? detectedSequences : (seq ? [seq] : []),
        settings: {
          ...DEFAULT_EXPORT_SETTINGS,
          inPoint: 0,
          outPoint: seq ? Math.max(0, seq.filePaths.length - 1) : 0,
          customWidth: seq?.width || DEFAULT_EXPORT_SETTINGS.customWidth,
          customHeight: seq?.height || DEFAULT_EXPORT_SETTINGS.customHeight,
        },
      };
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProjId);
      setExportSettings(newProj.settings);
    }
  };

  const handleCancelPendingFolder = () => {
    setPendingFolderAction(null);
  };

  // Browse Directory Button inside Editor
  const handleBrowseDirectory = async () => {
    if (window.electronAPI) {
      const dir = await window.electronAPI.selectDirectory('Select Image Sequence Folder');
      if (dir) {
        requestOpenFolder({ type: 'native', dirPath: dir });
      }
    } else {
      openBrowserFolderPicker({
        fromDashboard: false,
      });
    }
  };

  // Drag and Drop support (handles both Electron native paths and Browser File / Directory entries)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const readDroppedEntriesRecursively = async (items: DataTransferItemList): Promise<File[]> => {
    const collectedFiles: File[] = [];

    const traverseEntry = async (entry: any): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              collectedFiles.push(file);
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAllBatches = async (): Promise<any[]> => {
          const batch: any[] = await new Promise((resolve) => {
            reader.readEntries((entries: any[]) => resolve(entries || []), () => resolve([]));
          });
          if (batch.length === 0) return [];
          const rest = await readAllBatches();
          return [...batch, ...rest];
        };
        const children = await readAllBatches();
        for (const child of children) {
          await traverseEntry(child);
        }
      }
    };

    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
    }

    for (const entry of entries) {
      await traverseEntry(entry);
    }

    return collectedFiles;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && window.electronAPI) {
      const firstFile = files[0];
      const filePath =
        typeof (window.electronAPI as any).getPathForFile === 'function'
          ? (window.electronAPI as any).getPathForFile(firstFile)
          : (firstFile as any).path;
      if (filePath) {
        requestOpenFolder({ type: 'native', dirPath: filePath });
        return;
      }
    }

    // Fallback for Browser mode or when native file path isn't exposed
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const entryFiles = await readDroppedEntriesRecursively(e.dataTransfer.items);
      if (entryFiles.length > 0) {
        requestOpenFolder({ type: 'browser', files: entryFiles });
        return;
      }
    }

    if (files.length > 0) {
      requestOpenFolder({ type: 'browser', files: Array.from(files) });
    }
  };

  // Open Export Location Modal in 'select-only' mode when clicking Output -> Folder
  const handleSelectOutputDirectory = () => {
    setExportLocationModal({ open: true, mode: 'select-only' });
  };

  // Open Export Location Modal in 'export' mode when clicking Export MP4
  const handleRequestExport = () => {
    if (!selectedSequence) return;
    setExportLocationModal({ open: true, mode: 'export' });
  };

  // Select Custom FFmpeg binary
  const handleSelectCustomFFmpeg = async () => {
    if (window.electronAPI) {
      const binary = await window.electronAPI.selectFFmpegBinary();
      if (binary) {
        const info = await window.electronAPI.getFFmpegInfo();
        setFFmpegInfo(info);
        addLog('info', `Switched FFmpeg binary to: ${binary}`);
      }
    }
  };

  // Effective outPoint during playback (respects Trim Duplicate Loop Boundary Frame)
  const effectiveOutPoint =
    exportSettings.webOptimizations.seamlessLooping &&
    exportSettings.webOptimizations.dropDuplicateEndFrame &&
    outPoint > inPoint
      ? outPoint - 1
      : outPoint;

  // Viewport Playback Engine (requestAnimationFrame loop)
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || !selectedSequence || selectedSequence.filePaths.length === 0) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const frameIntervalMs = 1000 / Math.max(1, targetFramerate);
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= frameIntervalMs) {
        lastTimeRef.current = now - (elapsed % frameIntervalMs);

        setCurrentFrame((prevFrame) => {
          let nextFrame = prevFrame + 1;
          if (nextFrame > effectiveOutPoint) {
            if (isLooping) {
              nextFrame = inPoint;
            } else {
              setIsPlaying(false);
              return effectiveOutPoint;
            }
          }
          return nextFrame;
        });
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, targetFramerate, inPoint, effectiveOutPoint, isLooping, selectedSequence]);

  // Start Render Pipeline (supports both Electron IPC and local Vite server API without memory spikes)
  const executeRenderWithSettings = async (activeSettings: ExportSettings) => {
    if (!selectedSequence) return;

    setIsPlaying(false);
    browserRenderCancelledRef.current = false;

    const generated = generateFFmpegCommand(
      selectedSequence,
      activeSettings,
      ffmpegInfo?.binaryPath || 'ffmpeg'
    );

    setRenderState({
      status: 'rendering',
      progress: {
        frame: 0,
        fps: 0,
        bitrate: 'N/A',
        totalSize: 'N/A',
        outTime: '00:00:00',
        speed: '0x',
        progressPercent: 1,
      },
      activeCommand: generated.commandString,
    });

    addLog('info', `Starting Web MP4 render: ${generated.outputFilePath}`);

    try {
      let res: {
        success: boolean;
        outputPath?: string;
        outputSizeBytes?: number;
        error?: string;
        cancelled?: boolean;
      };

      if (window.electronAPI) {
        res = await window.electronAPI.startRender(selectedSequence, activeSettings);
      } else {
        // Local browser server mode — zero-heap streaming binary staging
        let sequenceForServer: SequenceItem = { ...selectedSequence };
        let stagedDir: string | undefined;
        const isStagedBlob = Boolean(selectedSequence.filePaths[0]?.startsWith('blob:'));

        if (isStagedBlob) {
          const initResp = await fetch('/api/stage-init', { method: 'POST' });
          const initData = await initResp.json();
          if (!initData.success || !initData.stageDir) {
            throw new Error(initData.error || 'Could not initialize local staging folder');
          }
          stagedDir = initData.stageDir;

          const total = selectedSequence.filePaths.length;
          addLog('info', `Streaming ${total} sequence frames to local FFmpeg staging folder...`);
          const stagedPaths: string[] = [];

          for (let i = 0; i < total; i++) {
            if (browserRenderCancelledRef.current) {
              throw new Error('__CANCELLED__');
            }
            const fp = selectedSequence.filePaths[i];
            const name =
              selectedSequence.fileNames?.[i] ||
              `frame_${String(i + 1).padStart(4, '0')}${selectedSequence.extension}`;

            // Use underlying File reference directly, or fetch blob one at a time without base64 allocation
            const fileOrBlob: Blob =
              browserBlobFilesRef.current.get(fp) || (await (await fetch(fp)).blob());

            const stageResp = await fetch(
              `/api/stage-frame?stageDir=${encodeURIComponent(stagedDir!)}&name=${encodeURIComponent(name)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: fileOrBlob,
              }
            );
            const stageData = await stageResp.json();
            if (!stageData.success || !stageData.filePath) {
              throw new Error(stageData.error || `Failed to stage frame ${name}`);
            }
            stagedPaths.push(stageData.filePath);

            const stagePct = Math.max(1, Math.round(((i + 1) / total) * 35));
            setRenderState((prev) => ({
              ...prev,
              progress: {
                ...prev.progress,
                frame: i + 1,
                progressPercent: stagePct,
              },
            }));
          }

          sequenceForServer = {
            ...selectedSequence,
            directory: stagedDir!,
            filePaths: stagedPaths,
          };
          addLog('info', `All ${total} frames staged on disk. Launching FFmpeg encoder...`);
        }

        // Poll live FFmpeg progress and logs while /api/start-render runs
        const pollTimer = window.setInterval(async () => {
          try {
            const pResp = await fetch('/api/render-progress');
            const pData = await pResp.json();
            if (pData.progress) {
              const rawPct = pData.progress.progressPercent || 0;
              const mappedPct = isStagedBlob
                ? Math.min(99, 35 + Math.round((rawPct / 100) * 64))
                : Math.max(1, Math.min(99, rawPct));
              setRenderState((prev) =>
                prev.status === 'rendering'
                  ? {
                      ...prev,
                      progress: {
                        ...pData.progress,
                        frame: pData.progress.frame || prev.progress.frame,
                        progressPercent: Math.max(prev.progress.progressPercent, mappedPct),
                      },
                    }
                  : prev
              );
            }
            if (Array.isArray(pData.logs) && pData.logs.length > 0) {
              setLogs((prev) => [...prev.slice(-300), ...pData.logs]);
            }
          } catch {}
        }, 150);

        try {
          const resp = await fetch('/api/start-render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sequence: sequenceForServer,
              settings: activeSettings,
              stagedDir,
            }),
          });
          res = await resp.json();
        } finally {
          window.clearInterval(pollTimer);
        }
      }

      if (res.success && res.outputPath) {
        setRenderState((prev) => ({
          ...prev,
          status: 'completed',
          outputPath: res.outputPath,
          outputSizeBytes: res.outputSizeBytes,
          progress: {
            ...prev.progress,
            frame: generated.totalOutputFrames,
            progressPercent: 100,
          },
        }));

        // Mark active project as 'exported' in project history
        if (activeProjectId) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === activeProjectId
                ? {
                    ...p,
                    status: 'exported',
                    exportedFilePath: res.outputPath,
                    exportedSizeBytes: res.outputSizeBytes,
                    updatedAt: Date.now(),
                  }
                : p
            )
          );
        }

        addLog('info', `MP4 Render successfully completed! Output: ${res.outputPath}`);
      } else if (res.cancelled) {
        setRenderState((prev) => ({
          ...prev,
          status: 'cancelled',
        }));
        addLog('warn', 'Render cancelled by user');
      } else {
        setRenderState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: res.error || 'Render failed',
        }));
        addLog('error', `Render failed: ${res.error}`);
      }
    } catch (err: any) {
      if (err?.message === '__CANCELLED__') {
        setRenderState((prev) => ({
          ...prev,
          status: 'cancelled',
        }));
        addLog('warn', 'Render cancelled by user');
      } else {
        setRenderState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err.message || 'Render failed',
        }));
        addLog('error', `Exception during render: ${err.message}`);
      }
    }
  };

  // Cancel Active Render
  const handleCancelRender = async () => {
    browserRenderCancelledRef.current = true;
    if (window.electronAPI) {
      await window.electronAPI.cancelRender();
      addLog('warn', 'Sent cancel signal to FFmpeg process');
    } else {
      await fetch('/api/cancel-render', { method: 'POST' }).catch(() => {});
      addLog('warn', 'Sent cancel signal to local FFmpeg process');
    }
  };

  // Open output file in Explorer
  const handleOpenOutputFolder = async (filePath: string) => {
    if (window.electronAPI) {
      await window.electronAPI.showItemInFolder(filePath);
    } else {
      await fetch(`/api/show-item?path=${encodeURIComponent(filePath)}`).catch(() => {});
    }
  };

  // Real-time MP4 File Size, Bitrate, and 4-Pillar Trade-Off Estimator
  const mp4Estimate = useMemo(
    () => estimateMP4Output(selectedSequence, exportSettings),
    [selectedSequence, exportSettings]
  );

  // Calculate live preview FFmpeg command
  const previewCommand = useMemo(
    () =>
      selectedSequence
        ? generateFFmpegCommand(
            selectedSequence,
            exportSettings,
            ffmpegInfo?.binaryPath || 'ffmpeg'
          ).commandString
        : undefined,
    [selectedSequence, exportSettings, ffmpegInfo?.binaryPath]
  );

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const hiddenFolderInput = (
    <input
      ref={browserFolderInputRef}
      type="file"
      {...({ webkitdirectory: '', directory: '' } as any)}
      multiple
      style={{ display: 'none' }}
      onChange={handleBrowserFolderFilesSelected}
    />
  );

  return (
    <>
      {hiddenFolderInput}
      {appScreen === 'splash' ? (
        <OpeningSplash
          onComplete={() =>
            setAppScreen(
              initialUIState.appScreen === 'editor' && initialUIState.activeProjectId
                ? 'editor'
                : 'dashboard'
            )
          }
        />
      ) : appScreen === 'dashboard' ? (
        <Dashboard
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          projects={projects}
          folders={folders}
          onOpenProject={handleOpenProject}
          onCreateNewProjectFromFolder={handleCreateNewProjectFromFolder}
          onCreateProjectFromTemplate={handleCreateProjectFromTemplate}
          onRenameProject={handleRenameProject}
          onCopyProject={handleCopyProject}
          onMoveProjectToFolder={handleMoveProjectToFolder}
          onDeleteProject={handleDeleteProject}
          onRestoreProject={handleRestoreProject}
          onPermanentDeleteProject={handlePermanentDeleteProject}
          onEmptyTrash={handleEmptyTrash}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
          onDeleteFolderChildren={handleDeleteFolderChildren}
          onMoveFolderProjects={handleMoveFolderProjects}
          layoutStyle={panelLayout.style}
          sidebarSplitterProps={panelLayout.splitterProps('dashSidebar')}
        />
      ) : (
        <div className="app-container" style={panelLayout.style}>
          {/* App Header */}
          <Header
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            isTerminalOpen={isTerminalOpen}
            onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            ffmpegInfo={ffmpegInfo}
            onOpenFolderDialog={handleBrowseDirectory}
            onBackToDashboard={() => {
              setIsPlaying(false);
              setAppScreen('dashboard');
            }}
            activeProjectName={activeProject?.name}
            activeProjectAccent={activeProject?.accentColor}
            onRenameActiveProject={(newName) => {
              if (activeProjectId) handleRenameProject(activeProjectId, newName);
            }}
          />

          {/* Main 2-Panel + Central Viewport Workspace Layout */}
          <div className="workspace-layout">
            {/* Left Panel: Input & Sequence Inspector */}
            <LeftPanel
              currentDirectory={currentDirectory}
              detectedSequences={detectedSequences}
              selectedSequence={selectedSequence}
              onSelectSequence={handleSelectSequence}
              onBrowseDirectory={handleBrowseDirectory}
              targetFramerate={targetFramerate}
              onChangeFramerate={setTargetFramerate}
              inPoint={inPoint}
              outPoint={outPoint}
              onChangeInPoint={setInPoint}
              onChangeOutPoint={setOutPoint}
              isDraggingOver={isDraggingOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              hasPendingFolder={Boolean(pendingFolderAction)}
              onOverwritePendingFolder={handleOverwritePendingFolder}
              onSaveAndCreateNewPendingFolder={handleSaveAndCreateNewPendingFolder}
              onCancelPendingFolder={handleCancelPendingFolder}
            />

            <Splitter axis="x" title="Drag to resize · double-click to reset" {...panelLayout.splitterProps('left')} />

            {/* Central Viewport Preview Monitor & Scrubber */}
            <CentralViewport
              sequence={selectedSequence}
              settings={exportSettings}
              estimate={mp4Estimate}
              renderedVideoPath={
                renderState.status === 'completed' ? renderState.outputPath : undefined
              }
              renderedVideoSizeBytes={
                renderState.status === 'completed' ? renderState.outputSizeBytes : undefined
              }
              targetFramerate={targetFramerate}
              inPoint={inPoint}
              outPoint={outPoint}
              currentFrame={currentFrame}
              onSeekFrame={setCurrentFrame}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              isLooping={isLooping}
              onToggleLoop={() => setIsLooping(!isLooping)}
              onSetInPoint={setInPoint}
              onSetOutPoint={setOutPoint}
              onBrowseDirectory={handleBrowseDirectory}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              timelineSplitterProps={panelLayout.splitterProps('timeline')}
            />

            <Splitter axis="x" title="Drag to resize · double-click to reset" {...panelLayout.splitterProps('right')} />

            {/* Right Panel: Web MP4 Optimization, Video Quality & Performance Tuning */}
            <RightPanel
              settings={exportSettings}
              onChangeSettings={setExportSettings}
              selectedSequence={selectedSequence}
              estimate={mp4Estimate}
              renderState={renderState}
              ffmpegInfo={ffmpegInfo}
              onStartRender={handleRequestExport}
              onCancelRender={handleCancelRender}
              onSelectOutputDirectory={handleSelectOutputDirectory}
              onOpenOutputFolder={handleOpenOutputFolder}
              onBrowseSequenceDirectory={handleBrowseDirectory}
            />
          </div>

          {/* Terminal / Log Drawer */}
          {isTerminalOpen && (
            <Splitter axis="y" title="Drag to resize · double-click to reset" {...panelLayout.splitterProps('term')} />
          )}
          <TerminalDrawer
            isOpen={isTerminalOpen}
            onToggle={() => setIsTerminalOpen(false)}
            logs={logs}
            activeCommand={renderState.activeCommand || previewCommand}
            onClearLogs={() => setLogs([])}
          />

          {/* Settings Modal */}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            ffmpegInfo={ffmpegInfo}
            onSelectCustomBinary={handleSelectCustomFFmpeg}
          />

          {/* Select Export Location Modal (prompted when clicking Export MP4 or Output Folder) */}
          <ExportLocationModal
            isOpen={exportLocationModal.open}
            mode={exportLocationModal.mode}
            initialDirectory={
              exportSettings.outputDirectory ||
              (selectedSequence?.directory && !selectedSequence.filePaths[0]?.startsWith('blob:')
                ? selectedSequence.directory
                : '')
            }
            filenameTemplate={exportSettings.filenameTemplate}
            previewFilename={
              selectedSequence
                ? formatOutputFilename(
                    exportSettings.filenameTemplate,
                    selectedSequence,
                    exportSettings,
                    mp4Estimate.outputWidth,
                    mp4Estimate.outputHeight
                  )
                : 'output.mp4'
            }
            estimatedSizeFormatted={mp4Estimate.estimatedFormatted}
            onClose={() => setExportLocationModal((prev) => ({ ...prev, open: false }))}
            onConfirm={(chosenDir, chosenTemplate, startExportNow) => {
              const nextSettings: ExportSettings = {
                ...exportSettings,
                outputDirectory: chosenDir,
                filenameTemplate: chosenTemplate,
              };
              setExportSettings(nextSettings);
              setExportLocationModal((prev) => ({ ...prev, open: false }));
              addLog('info', `Export destination set: ${chosenDir}`);
              if (startExportNow) {
                executeRenderWithSettings(nextSettings);
              }
            }}
          />
        </div>
      )}
    </>
  );
};
