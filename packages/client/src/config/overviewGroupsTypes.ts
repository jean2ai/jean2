export interface OverviewGroup {
  id: string;
  serverId: string;
  name: string;
  workspaceIds: string[];
}

export interface OverviewGroupsDocument {
  version: 1;
  groups: OverviewGroup[];
  activeGroupIdByServer: Record<string, string>;
}
