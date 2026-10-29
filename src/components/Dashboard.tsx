import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  FileEdit,
  CheckCircle2,
  Trash2,
  Folder,
  FolderPlus,
  FolderX,
  LayoutTemplate,
  Plus,
  Search,
  MoreHorizontal,
  ExternalLink,
  Edit3,
  Copy,
  FolderInput,
  RotateCcw,
  Sun,
  Moon,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  Film,
  ArrowUpRight,
} from 'lucide-react';
import { GrowmarkWordmark } from './BrandLogo';
import {
  ProjectItem,
  ProjectFolder,
  ProjectTemplate,
  PROJECT_TEMPLATES,
  formatRelativeTime,
} from '../core/projectStore';
import { formatBytes } from '../core/timecode';
import { resolveMediaUrl } from '../core/previewUrl';
import { loadPersistedUIState, savePersistedUIState } from '../core/cookieStore';
import { Splitter } from './Splitter';

export type DashboardSection =
  | 'recent'
  | 'drafts'
  | 'exported'
  | 'templates'
  | 'trash'
  | `folder:${string}`;

interface DashboardProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  projects: ProjectItem[];
  folders: ProjectFolder[];
  onOpenProject: (project: ProjectItem) => void;
  onCreateNewProjectFromFolder: (template?: ProjectTemplate, targetFolderId?: string | null) => void;
  onCreateProjectFromTemplate: (template: ProjectTemplate, targetFolderId?: string | null) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onCopyProject: (projectId: string) => void;
  onMoveProjectToFolder: (projectId: string, folderId: string | null) => void;
  onDeleteProject: (projectId: string) => void;
  onRestoreProject: (projectId: string) => void;
  onPermanentDeleteProject: (projectId: string) => void;
  onEmptyTrash: () => void;
  onCreateFolder: (name: string, color?: string, parentId?: string | null) => ProjectFolder;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveFolder: (folderId: string, targetParentId: string | null) => void;
  onDeleteFolderChildren: (folderId: string) => void;
  onMoveFolderProjects: (sourceFolderId: string, targetFolderId: string | null) => void;
  layoutStyle?: React.CSSProperties;
  sidebarSplitterProps?: {
    onDragStart: () => void;
    onDrag: (delta: number) => void;
    onReset?: () => void;
  };
}

const ProjectThumbnail: React.FC<{ project: ProjectItem }> = ({ project }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = project.thumbnailPath && !imgFailed ? resolveMediaUrl(project.thumbnailPath) : null;

  if (src) {
    return (
      <div className="project-row-thumb">
        <img
          src={src}
          alt={project.name}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div
      className="project-row-thumb"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Film size={13} style={{ color: 'var(--text-secondary)' }} />
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({
  theme,
  onToggleTheme,
  projects,
  folders,
  onOpenProject,
  onCreateNewProjectFromFolder,
  onCreateProjectFromTemplate,
  onRenameProject,
  onCopyProject,
  onMoveProjectToFolder,
  onDeleteProject,
  onRestoreProject,
  onPermanentDeleteProject,
  onEmptyTrash,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onDeleteFolderChildren,
  onMoveFolderProjects,
  layoutStyle,
  sidebarSplitterProps,
}) => {
  const [activeSection, setActiveSection] = useState<DashboardSection>(
    () => (loadPersistedUIState().dashboardSection as DashboardSection) || 'recent'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    savePersistedUIState({ dashboardSection: activeSection });
  }, [activeSection]);

  // Inline project rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Open row action menu state
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [moveSubmenuProjectId, setMoveSubmenuProjectId] = useState<string | null>(null);

  // Inline folder creation state (supports both root and child folders)
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [newFolderInputName, setNewFolderInputName] = useState<string>('Untitled');

  // Inline folder rename state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState<string>('');

  // Expand / collapse subfolders state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  // Floating context menu state for folders
  const [folderContextMenu, setFolderContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);

  // Active submenu inside folder context menu ('moveFolder' | 'moveFiles' | null)
  const [submenuActive, setSubmenuActive] = useState<'moveFolder' | 'moveFiles' | null>(null);

  // Global listeners for closing context menus & inline inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFolderContextMenu(null);
        setSubmenuActive(null);
        setOpenMenuProjectId(null);
        setMoveSubmenuProjectId(null);
        setCreatingFolderParentId(null);
      }
    };
    const handleClickOutside = () => {
      setFolderContextMenu(null);
      setSubmenuActive(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const activeFolderId = activeSection.startsWith('folder:')
    ? activeSection.replace('folder:', '')
    : null;
  const activeFolder = folders.find((f) => f.id === activeFolderId) || null;

  // Hierarchical helper: get all descendant folder IDs recursively
  const getDescendantFolderIds = (folderId: string, allFolders: ProjectFolder[]): Set<string> => {
    const ids = new Set<string>();
    const add = (id: string) => {
      for (const f of allFolders) {
        if (f.parentId === id && !ids.has(f.id)) {
          ids.add(f.id);
          add(f.id);
        }
      }
    };
    add(folderId);
    return ids;
  };

  // Precomputed branch map: folderId -> Set of (folderId + all descendant folderIds)
  const branchFolderIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const f of folders) {
      const descendants = getDescendantFolderIds(f.id, folders);
      descendants.add(f.id);
      map.set(f.id, descendants);
    }
    return map;
  }, [folders]);

  // Children mapping for folder tree
  const folderChildrenMap = useMemo(() => {
    const map = new Map<string, ProjectFolder[]>();
    for (const f of folders) {
      if (f.parentId) {
        const list = map.get(f.parentId) || [];
        list.push(f);
        map.set(f.parentId, list);
      }
    }
    return map;
  }, [folders]);

  const rootFolders = useMemo(() => {
    return folders.filter((f) => !f.parentId);
  }, [folders]);

  const activeContextMenuFolder = useMemo(() => {
    return folderContextMenu ? folders.find((f) => f.id === folderContextMenu.folderId) || null : null;
  }, [folderContextMenu, folders]);

  // Invalid destinations when moving folder (cannot move into self or descendants)
  const invalidMoveDestinations = useMemo(() => {
    if (!activeContextMenuFolder) return new Set<string>();
    const descendants = getDescendantFolderIds(activeContextMenuFolder.id, folders);
    descendants.add(activeContextMenuFolder.id);
    return descendants;
  }, [activeContextMenuFolder, folders]);

  const validMoveDestinations = useMemo(() => {
    return folders.filter((f) => !invalidMoveDestinations.has(f.id));
  }, [folders, invalidMoveDestinations]);

  const getFolderFullName = (fld: ProjectFolder): string => {
    const parts = [fld.name];
    let curr = fld;
    while (curr.parentId) {
      const parent = folders.find((f) => f.id === curr.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      curr = parent;
    }
    return parts.join(' / ');
  };

  const getFolderProjectCount = (folderId: string) => {
    const branchIds = branchFolderIds.get(folderId);
    return projects.filter(
      (p) => !p.isDeleted && p.folderId && branchIds && branchIds.has(p.folderId)
    ).length;
  };

  // Counts for sidebar badges
  const counts = useMemo(() => {
    const active = projects.filter((p) => !p.isDeleted);
    const trash = projects.filter((p) => p.isDeleted);
    const drafts = active.filter((p) => p.status === 'draft');
    const exported = active.filter((p) => p.status === 'exported');
    return {
      recent: active.length,
      drafts: drafts.length,
      exported: exported.length,
      trash: trash.length,
    };
  }, [projects]);

  // Filtered projects for current section
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (activeSection === 'trash') return p.isDeleted;
      if (p.isDeleted) return false;
      if (activeSection === 'drafts') return p.status === 'draft';
      if (activeSection === 'exported') return p.status === 'exported';
      if (activeFolderId) {
        const branchIds = branchFolderIds.get(activeFolderId);
        return Boolean(p.folderId && branchIds && branchIds.has(p.folderId));
      }
      return true;
    });

    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sequencePattern && p.sequencePattern.toLowerCase().includes(q)) ||
          (p.templatePoint && p.templatePoint.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, activeSection, activeFolderId, branchFolderIds, searchQuery]);

  const startRename = (project: ProjectItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
    setOpenMenuProjectId(null);
  };

  const commitRename = (projectId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameProject(projectId, trimmed);
    }
    setRenamingId(null);
  };

  const startCreatingFolderUnder = (parentId: string | null) => {
    if (parentId) {
      setExpandedFolders((prev) => new Set([...prev, parentId]));
    }
    setCreatingFolderParentId(parentId === null ? '__ROOT__' : parentId);
    setNewFolderInputName('Untitled');
    setFolderContextMenu(null);
    setSubmenuActive(null);
  };

  const commitCreateFolder = () => {
    const trimmed = newFolderInputName.trim() || 'Untitled';
    const parentId = creatingFolderParentId === '__ROOT__' ? null : creatingFolderParentId;
    const created = onCreateFolder(trimmed, '#8E8E93', parentId);
    setCreatingFolderParentId(null);
    setNewFolderInputName('Untitled');
    setActiveSection(`folder:${created.id}`);
  };

  const cancelCreateFolder = () => {
    setCreatingFolderParentId(null);
    setNewFolderInputName('Untitled');
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: ProjectFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenMenuProjectId(null);
    setMoveSubmenuProjectId(null);

    const menuWidth = 220;
    const menuHeight = 280;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 16);

    setFolderContextMenu({
      folderId: folder.id,
      x: Math.max(8, x),
      y: Math.max(8, y),
    });
    setSubmenuActive(null);
  };

  const handleCreateSubfolder = (parentFolderId: string) => {
    startCreatingFolderUnder(parentFolderId);
  };

  const getSectionTitle = () => {
    if (activeSection === 'recent') return 'Recents';
    if (activeSection === 'drafts') return 'Drafts';
    if (activeSection === 'exported') return 'Exported';
    if (activeSection === 'templates') return 'Templates';
    if (activeSection === 'trash') return 'Recently Deleted';
    if (activeFolder) return getFolderFullName(activeFolder);
    return 'Projects';
  };

  const renderInlineCreateRow = (depth: number, parentId: string | null) => {
    return (
      <div
        key={`creating-${parentId || 'root'}`}
        className="dashboard-nav-item"
        style={{
          paddingLeft: `${10 + depth * 14}px`,
          cursor: 'default',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <span style={{ width: depth > 0 ? '14px' : '0px', flexShrink: 0 }} />
          <Folder size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            type="text"
            className="folder-inline-create-input"
            value={newFolderInputName}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setNewFolderInputName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCreateFolder();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCreateFolder();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-icon folder-inline-check-btn"
          style={{
            width: '20px',
            height: '20px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: '4px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            commitCreateFolder();
          }}
          title="Create folder (or press Enter)"
        >
          <Check size={13} strokeWidth={2.5} />
        </button>
      </div>
    );
  };

  const renderFolderNode = (folder: ProjectFolder, depth = 0) => {
    const children = folderChildrenMap.get(folder.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = activeSection === `folder:${folder.id}`;
    const isContextActive = folderContextMenu?.folderId === folder.id;
    const folderCount = getFolderProjectCount(folder.id);

    return (
      <React.Fragment key={folder.id}>
        <div
          className={`dashboard-nav-item ${isSelected || isContextActive ? 'active' : ''}`}
          style={{
            paddingLeft: `${10 + depth * 14}px`,
            userSelect: 'none',
          }}
          onClick={() => setActiveSection(`folder:${folder.id}`)}
          onContextMenu={(e) => handleFolderContextMenu(e, folder)}
        >
          {renamingFolderId === folder.id ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                className="input-field"
                style={{ height: '22px', padding: '0 6px', fontSize: '11px', width: '100%' }}
                value={renameFolderValue}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setRenameFolderValue(e.target.value)}
                onBlur={() => {
                  if (renameFolderValue.trim() && renameFolderValue.trim() !== folder.name) {
                    onRenameFolder(folder.id, renameFolderValue.trim());
                  }
                  setRenamingFolderId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (renameFolderValue.trim()) {
                      onRenameFolder(folder.id, renameFolderValue.trim());
                    }
                    setRenamingFolderId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingFolderId(null);
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                {hasChildren ? (
                  <button
                    className="btn btn-icon"
                    style={{
                      width: '14px',
                      height: '14px',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedFolders((prev) => {
                        const next = new Set(prev);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        return next;
                      });
                    }}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                ) : (
                  <span style={{ width: depth > 0 ? '14px' : '0px', flexShrink: 0 }} />
                )}
                <Folder size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={folder.name}
                >
                  {folder.name}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                <button
                  className="folder-action-plus btn btn-icon"
                  style={{
                    width: '18px',
                    height: '18px',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startCreatingFolderUnder(folder.id);
                  }}
                  title={`Create folder under ${folder.name}`}
                >
                  <Plus size={12} />
                </button>
                <span className="dashboard-nav-badge">{folderCount}</span>
              </div>
            </>
          )}
        </div>
        {creatingFolderParentId === folder.id && renderInlineCreateRow(depth + 1, folder.id)}
        {isExpanded && children.map((child) => renderFolderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div
      className="dashboard-shell"
      style={layoutStyle}
      onClick={() => {
        setOpenMenuProjectId(null);
        setMoveSubmenuProjectId(null);
        setFolderContextMenu(null);
        setSubmenuActive(null);
      }}
    >
      {/* Left Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        {/* Brand Identity Header */}
        <div className="dashboard-brand">
          <GrowmarkWordmark width={116} color="var(--text-primary)" />
        </div>

        {/* Primary CTA Button (Blue Accent) */}
        <div style={{ padding: '12px 12px 6px' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', height: '34px', justifyContent: 'center' }}
            onClick={() => onCreateNewProjectFromFolder(undefined, activeFolderId)}
          >
            <Plus size={14} />
            Open Sequence
          </button>
        </div>

        {/* Main Navigation Views */}
        <nav className="dashboard-nav">
          <div className="dashboard-nav-group-label">Library</div>
          <button
            className={`dashboard-nav-item ${activeSection === 'recent' ? 'active' : ''}`}
            onClick={() => setActiveSection('recent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} />
              <span>Recents</span>
            </div>
            <span className="dashboard-nav-badge">{counts.recent}</span>
          </button>

          <button
            className={`dashboard-nav-item ${activeSection === 'drafts' ? 'active' : ''}`}
            onClick={() => setActiveSection('drafts')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileEdit size={14} />
              <span>Drafts</span>
            </div>
            <span className="dashboard-nav-badge">{counts.drafts}</span>
          </button>

          <button
            className={`dashboard-nav-item ${activeSection === 'exported' ? 'active' : ''}`}
            onClick={() => setActiveSection('exported')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={14} />
              <span>Exported</span>
            </div>
            <span className="dashboard-nav-badge">{counts.exported}</span>
          </button>

          <button
            className={`dashboard-nav-item ${activeSection === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveSection('templates')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LayoutTemplate size={14} />
              <span>Templates</span>
            </div>
            <span className="dashboard-nav-badge">{PROJECT_TEMPLATES.length}</span>
          </button>

          {/* Folders List */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 10px 4px',
            }}
          >
            <span className="dashboard-nav-group-label" style={{ padding: 0 }}>
              Folders
            </span>
            <button
              className="btn btn-icon"
              style={{ width: '20px', height: '20px', border: 'none', background: 'transparent' }}
              onClick={(e) => {
                e.stopPropagation();
                startCreatingFolderUnder(null);
              }}
              title="New Folder"
            >
              <Plus size={13} />
            </button>
          </div>

          {creatingFolderParentId === '__ROOT__' && renderInlineCreateRow(0, null)}

          {rootFolders.map((folder) => renderFolderNode(folder, 0))}

          <div style={{ flex: 1 }} />

          {/* Recently Deleted */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
            <button
              className={`dashboard-nav-item ${activeSection === 'trash' ? 'active' : ''}`}
              onClick={() => setActiveSection('trash')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={14} />
                <span>Recently Deleted</span>
              </div>
              <span className="dashboard-nav-badge">{counts.trash}</span>
            </button>
          </div>
        </nav>
      </aside>

      {sidebarSplitterProps && (
        <Splitter
          axis="x"
          title="Drag to resize sidebar · double-click to reset"
          {...sidebarSplitterProps}
        />
      )}

      {/* Main Content Area */}
      <main className="dashboard-main">
        {/* Top Toolbar */}
        <header className="dashboard-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.018em' }}>
              {getSectionTitle()}
            </h1>
            {activeFolder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="btn"
                  style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                  onClick={() => handleCreateSubfolder(activeFolder.id)}
                  title="Create subfolder inside this folder"
                >
                  <FolderPlus size={12} style={{ marginRight: '4px' }} />
                  New Subfolder
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Search Box */}
            <div style={{ position: 'relative', width: '210px' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '9px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                className="input-field"
                style={{
                  paddingLeft: '28px',
                  height: '28px',
                  fontSize: '12px',
                  backgroundColor: 'transparent',
                }}
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {activeSection === 'trash' && counts.trash > 0 && (
              <button
                className="btn"
                style={{ height: '28px', fontSize: '12px', backgroundColor: 'transparent' }}
                onClick={onEmptyTrash}
              >
                Empty Trash
              </button>
            )}

            {/* Theme Toggle */}
            <button
              className="btn btn-icon"
              style={{ width: '28px', height: '28px', backgroundColor: 'transparent' }}
              onClick={onToggleTheme}
              title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            >
              {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          </div>
        </header>

        <div className="dashboard-scroll-body">
          {/* Minimal Apple-Style Templates Strip */}
          {(activeSection === 'recent' || activeSection === 'templates') && (
            <section style={{ marginBottom: activeSection === 'recent' ? '28px' : '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Templates
                </span>
                {activeSection === 'recent' && (
                  <button
                    onClick={() => setActiveSection('templates')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    See All
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    activeSection === 'templates'
                      ? 'repeat(auto-fill, minmax(250px, 1fr))'
                      : 'repeat(4, minmax(190px, 1fr))',
                  gap: '10px',
                }}
              >
                {(activeSection === 'templates'
                  ? PROJECT_TEMPLATES
                  : PROJECT_TEMPLATES.slice(0, 4)
                ).map((tpl) => (
                  <div
                    key={tpl.id}
                    className="apple-template-card"
                    onClick={() => onCreateProjectFromTemplate(tpl, activeFolderId)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {tpl.category}
                      </span>
                      <ArrowUpRight size={13} style={{ color: 'var(--text-muted)' }} />
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        letterSpacing: '-0.015em',
                        marginBottom: '4px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {tpl.name}
                    </div>

                    <div
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        marginBottom: '12px',
                        flex: 1,
                      }}
                    >
                      {tpl.specificPoint}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-subtle)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>
                        {tpl.settings.targetFramerate} fps · CRF {tpl.settings.crf}
                      </span>
                      <span
                        style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateNewProjectFromFolder(tpl, activeFolderId);
                        }}
                      >
                        Select Folder
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects List Table: Name | Last modified | Created */}
          {activeSection !== 'templates' && (
            <section>
              <div className="projects-table-container">
                <div className="projects-table-header">
                  <div className="col-name">Name</div>
                  <div className="col-modified">Last modified</div>
                  <div className="col-created">Created</div>
                  <div className="col-actions" />
                </div>

                {filteredProjects.length === 0 ? (
                  <div
                    style={{
                      padding: '48px 16px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '12.5px',
                    }}
                  >
                    {activeSection === 'trash'
                      ? 'No recently deleted projects.'
                      : 'No projects yet.'}
                  </div>
                ) : (
                  <div className="projects-table-body">
                    {filteredProjects.map((project) => {
                      const folder = folders.find((f) => f.id === project.folderId);
                      const isRenaming = renamingId === project.id;
                      const isMenuOpen = openMenuProjectId === project.id;
                      const isMoveOpen = moveSubmenuProjectId === project.id;

                      return (
                        <div
                          key={project.id}
                          className="projects-table-row"
                          onDoubleClick={() => {
                            if (!project.isDeleted && !isRenaming) {
                              onOpenProject(project);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMenuProjectId(project.id);
                            setMoveSubmenuProjectId(null);
                          }}
                        >
                          {/* Column 1: Rounded Small Image Preview + Title */}
                          <div className="col-name">
                            <ProjectThumbnail project={project} />

                            {isRenaming ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  flex: 1,
                                  maxWidth: '320px',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  className="input-field"
                                  style={{ height: '26px', padding: '0 8px', fontSize: '12.5px' }}
                                  value={renameValue}
                                  autoFocus
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename(project.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                  }}
                                />
                                <button
                                  className="btn btn-primary"
                                  style={{ height: '26px', padding: '0 8px', fontSize: '11px' }}
                                  onClick={() => commitRename(project.id)}
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  overflow: 'hidden',
                                }}
                              >
                                <span
                                  className="project-row-title"
                                  onClick={() => {
                                    if (!project.isDeleted) onOpenProject(project);
                                  }}
                                >
                                  {project.name}
                                </span>

                                {folder && (!activeFolderId || project.folderId !== activeFolderId) && (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveSection(`folder:${folder.id}`);
                                    }}
                                  >
                                    {getFolderFullName(folder)}
                                  </span>
                                )}

                                {project.status === 'exported' && project.exportedSizeBytes && (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    {formatBytes(project.exportedSizeBytes)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Column 2: Last modified */}
                          <div className="col-modified">
                            {formatRelativeTime(project.updatedAt)}
                          </div>

                          {/* Column 3: Created */}
                          <div className="col-created">
                            {formatRelativeTime(project.createdAt)}
                          </div>

                          {/* Column 4: Actions */}
                          <div
                            className="col-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {project.isDeleted ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                  className="btn"
                                  style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                                  onClick={() => onRestoreProject(project.id)}
                                >
                                  <RotateCcw size={11} />
                                  Restore
                                </button>
                                <button
                                  className="btn"
                                  style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                                  onClick={() => onPermanentDeleteProject(project.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  position: 'relative',
                                }}
                              >
                                <button
                                  className="btn row-hover-action"
                                  style={{ height: '24px', fontSize: '11px', padding: '0 10px' }}
                                  onClick={() => onOpenProject(project)}
                                >
                                  Open
                                </button>

                                <button
                                  className="btn btn-icon"
                                  style={{
                                    width: '26px',
                                    height: '26px',
                                    background: 'transparent',
                                    borderColor: 'transparent',
                                  }}
                                  onClick={() => {
                                    setOpenMenuProjectId(isMenuOpen ? null : project.id);
                                    setMoveSubmenuProjectId(null);
                                  }}
                                >
                                  <MoreHorizontal size={14} />
                                </button>

                                {isMenuOpen && (
                                  <div className="project-context-menu">
                                    <button
                                      className="context-menu-item"
                                      onClick={() => {
                                        setOpenMenuProjectId(null);
                                        onOpenProject(project);
                                      }}
                                    >
                                      <ExternalLink size={13} />
                                      <span>Open</span>
                                    </button>

                                    <button
                                      className="context-menu-item"
                                      onClick={(e) => startRename(project, e)}
                                    >
                                      <Edit3 size={13} />
                                      <span>Rename</span>
                                    </button>

                                    <button
                                      className="context-menu-item"
                                      onClick={() => {
                                        setOpenMenuProjectId(null);
                                        onCopyProject(project.id);
                                      }}
                                    >
                                      <Copy size={13} />
                                      <span>Duplicate</span>
                                    </button>

                                    <div style={{ position: 'relative' }}>
                                      <button
                                        className="context-menu-item"
                                        style={{ justifyContent: 'space-between' }}
                                        onClick={() =>
                                          setMoveSubmenuProjectId(isMoveOpen ? null : project.id)
                                        }
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                          }}
                                        >
                                          <FolderInput size={13} />
                                          <span>Move to Folder</span>
                                        </div>
                                        <ChevronRight size={12} />
                                      </button>

                                      {isMoveOpen && (
                                        <div className="project-context-submenu">
                                          {folders.map((fld) => (
                                            <button
                                              key={fld.id}
                                              className="context-menu-item"
                                              onClick={() => {
                                                onMoveProjectToFolder(project.id, fld.id);
                                                setOpenMenuProjectId(null);
                                                setMoveSubmenuProjectId(null);
                                              }}
                                            >
                                              <Folder size={12} />
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {getFolderFullName(fld)}
                                              </span>
                                              {project.folderId === fld.id && (
                                                <Check
                                                  size={12}
                                                  style={{ marginLeft: 'auto' }}
                                                />
                                              )}
                                            </button>
                                          ))}
                                          {project.folderId && (
                                            <button
                                              className="context-menu-item"
                                              onClick={() => {
                                                onMoveProjectToFolder(project.id, null);
                                                setOpenMenuProjectId(null);
                                                setMoveSubmenuProjectId(null);
                                              }}
                                            >
                                              <X size={12} />
                                              <span>Remove from Folder</span>
                                            </button>
                                          )}
                                          <div
                                            style={{
                                              borderTop: '1px solid var(--border-subtle)',
                                              margin: '4px 0',
                                            }}
                                          />
                                          <button
                                            className="context-menu-item"
                                            onClick={() => {
                                              setOpenMenuProjectId(null);
                                              setMoveSubmenuProjectId(null);
                                              startCreatingFolderUnder(null);
                                            }}
                                          >
                                            <FolderPlus size={12} />
                                            <span>New Folder...</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      style={{
                                        borderTop: '1px solid var(--border-subtle)',
                                        margin: '4px 0',
                                      }}
                                    />

                                    <button
                                      className="context-menu-item"
                                      onClick={() => {
                                        setOpenMenuProjectId(null);
                                        onDeleteProject(project.id);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Floating Right-Click Context Menu for Folders */}
      {folderContextMenu && activeContextMenuFolder && (
        <div
          className="folder-context-menu"
          style={{
            left: `${folderContextMenu.x}px`,
            top: `${folderContextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Rename */}
          <button
            className="context-menu-item"
            onClick={() => {
              setRenamingFolderId(activeContextMenuFolder.id);
              setRenameFolderValue(activeContextMenuFolder.name);
              setFolderContextMenu(null);
              setSubmenuActive(null);
            }}
          >
            <Edit3 size={13} />
            <span>Rename</span>
          </button>

          {/* New Subfolder */}
          <button
            className="context-menu-item"
            onClick={() => {
              handleCreateSubfolder(activeContextMenuFolder.id);
            }}
          >
            <FolderPlus size={13} />
            <span>New Subfolder</span>
          </button>

          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

          {/* Move Folder to... */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setSubmenuActive('moveFolder')}
          >
            <button
              className="context-menu-item"
              style={{ justifyContent: 'space-between' }}
              onClick={(e) => {
                e.stopPropagation();
                setSubmenuActive(submenuActive === 'moveFolder' ? null : 'moveFolder');
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderInput size={13} />
                <span>Move Folder to...</span>
              </div>
              <ChevronRight size={12} />
            </button>

            {submenuActive === 'moveFolder' && (
              <div
                className="fixed-context-submenu"
                style={{
                  left: folderContextMenu.x + 215 + 195 > window.innerWidth ? 'auto' : '100%',
                  right: folderContextMenu.x + 215 + 195 > window.innerWidth ? '100%' : 'auto',
                  marginLeft: folderContextMenu.x + 215 + 195 > window.innerWidth ? 0 : '4px',
                  marginRight: folderContextMenu.x + 215 + 195 > window.innerWidth ? '4px' : 0,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {activeContextMenuFolder.parentId && (
                  <>
                    <button
                      className="context-menu-item"
                      onClick={() => {
                        onMoveFolder(activeContextMenuFolder.id, null);
                        setFolderContextMenu(null);
                        setSubmenuActive(null);
                      }}
                    >
                      <Folder size={12} />
                      <span>Top Level (Root)</span>
                    </button>
                    <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                  </>
                )}

                {validMoveDestinations.length === 0 && !activeContextMenuFolder.parentId ? (
                  <div style={{ padding: '6px 9px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    No other folders
                  </div>
                ) : (
                  validMoveDestinations.map((dest) => (
                    <button
                      key={dest.id}
                      className="context-menu-item"
                      onClick={() => {
                        onMoveFolder(activeContextMenuFolder.id, dest.id);
                        setExpandedFolders((prev) => new Set([...prev, dest.id]));
                        setFolderContextMenu(null);
                        setSubmenuActive(null);
                      }}
                    >
                      <Folder size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getFolderFullName(dest)}
                      </span>
                      {activeContextMenuFolder.parentId === dest.id && (
                        <Check size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Move All Files to... */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setSubmenuActive('moveFiles')}
          >
            <button
              className="context-menu-item"
              style={{ justifyContent: 'space-between' }}
              onClick={(e) => {
                e.stopPropagation();
                setSubmenuActive(submenuActive === 'moveFiles' ? null : 'moveFiles');
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CornerDownRight size={13} />
                <span>Move All Files to...</span>
              </div>
              <ChevronRight size={12} />
            </button>

            {submenuActive === 'moveFiles' && (
              <div
                className="fixed-context-submenu"
                style={{
                  left: folderContextMenu.x + 215 + 195 > window.innerWidth ? 'auto' : '100%',
                  right: folderContextMenu.x + 215 + 195 > window.innerWidth ? '100%' : 'auto',
                  marginLeft: folderContextMenu.x + 215 + 195 > window.innerWidth ? 0 : '4px',
                  marginRight: folderContextMenu.x + 215 + 195 > window.innerWidth ? '4px' : 0,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {folders
                  .filter((f) => f.id !== activeContextMenuFolder.id)
                  .map((dest) => (
                    <button
                      key={dest.id}
                      className="context-menu-item"
                      onClick={() => {
                        onMoveFolderProjects(activeContextMenuFolder.id, dest.id);
                        setFolderContextMenu(null);
                        setSubmenuActive(null);
                      }}
                    >
                      <Folder size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getFolderFullName(dest)}
                      </span>
                    </button>
                  ))}
                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onMoveFolderProjects(activeContextMenuFolder.id, null);
                    setFolderContextMenu(null);
                    setSubmenuActive(null);
                  }}
                >
                  <X size={12} />
                  <span>Remove from Folder (Unorganized)</span>
                </button>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

          {/* Delete All Children */}
          <button
            className="context-menu-item danger"
            onClick={() => {
              const confirmDelete = window.confirm(
                `Delete all files and subfolders inside "${activeContextMenuFolder.name}"?\n\nThis will move all projects inside this folder to Recently Deleted and delete all subfolders. The folder itself will remain.`
              );
              if (confirmDelete) {
                onDeleteFolderChildren(activeContextMenuFolder.id);
                setFolderContextMenu(null);
                setSubmenuActive(null);
              }
            }}
          >
            <FolderX size={13} />
            <span>Delete All Children</span>
          </button>

          {/* Delete Folder */}
          <button
            className="context-menu-item danger"
            onClick={() => {
              const childCount = getFolderProjectCount(activeContextMenuFolder.id);
              const subfolders = folders.filter((f) => f.parentId === activeContextMenuFolder.id);
              if (childCount > 0 || subfolders.length > 0) {
                const ok = window.confirm(
                  `Delete folder "${activeContextMenuFolder.name}"? It contains ${childCount} project${childCount === 1 ? '' : 's'}${subfolders.length > 0 ? ` and ${subfolders.length} subfolder${subfolders.length === 1 ? '' : 's'}` : ''}.`
                );
                if (!ok) return;
              }
              onDeleteFolder(activeContextMenuFolder.id);
              if (activeSection === `folder:${activeContextMenuFolder.id}`) {
                setActiveSection('recent');
              }
              setFolderContextMenu(null);
              setSubmenuActive(null);
            }}
          >
            <Trash2 size={13} />
            <span>Delete Folder</span>
          </button>
        </div>
      )}
    </div>
  );
};
