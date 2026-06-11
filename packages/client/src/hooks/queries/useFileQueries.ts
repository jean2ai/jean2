import { useQuery } from '@tanstack/react-query';
import type { Jean2Client } from '@jean2/sdk';
import { queryKeys } from '@/lib/queryKeys';

export function useFileBrowseQuery(
  sdkClient: Jean2Client | null,
  workspaceId: string | undefined,
  path?: string,
  opts?: { showHidden?: boolean },
  enabledOverride?: boolean,
) {
  return useQuery({
    queryKey: queryKeys.files.browse(workspaceId ?? '', path, opts),
    queryFn: () => sdkClient!.http.files.browse(workspaceId!, path, opts),
    enabled: !!sdkClient && !!workspaceId && (enabledOverride ?? true),
    staleTime: 0,
  });
}

export function useFileBrowseFsQuery(
  sdkClient: Jean2Client | null,
  path: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.files.browseFs(path),
    queryFn: () => sdkClient!.http.files.browseFs(path),
    enabled: !!sdkClient && enabled,
  });
}

export function useFileDrivesQuery(sdkClient: Jean2Client | null) {
  return useQuery({
    queryKey: queryKeys.files.drives,
    queryFn: () => sdkClient!.http.files.drives(),
    enabled: !!sdkClient,
  });
}

export function useFileParentQuery(
  sdkClient: Jean2Client | null,
  currentPath: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.files.parent(currentPath),
    queryFn: () => sdkClient!.http.files.parent(currentPath),
    enabled: !!sdkClient && enabled,
  });
}

export function useFilePreviewQuery(
  sdkClient: Jean2Client | null,
  workspaceId: string | undefined,
  path: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.files.preview(workspaceId ?? '', path ?? ''),
    queryFn: () => sdkClient!.http.files.preview(workspaceId!, path!),
    enabled: !!sdkClient && !!workspaceId && !!path && enabled,
    staleTime: 0,
  });
}

export function useFileGitDiffQuery(
  sdkClient: Jean2Client | null,
  workspaceId: string | undefined,
  path: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.files.gitDiff(workspaceId ?? '', path ?? ''),
    queryFn: () => sdkClient!.http.files.gitDiff(workspaceId!, path!),
    enabled: !!sdkClient && !!workspaceId && !!path && enabled,
    staleTime: 0,
  });
}
