import { BlockKind, ProfileViewport } from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ProfileBlockEntityProps extends BaseEntityProps {
  userId: string;
  viewport: ProfileViewport;
  tabId?: string | null;
  kind: BlockKind;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  isVisible?: boolean;
  pinnedAllTabs?: boolean;
  config?: unknown | null;
}

export interface BlockPosition {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

export class ProfileBlockEntity extends BaseEntity<ProfileBlockEntityProps> {
  public userId: string;
  public viewport: ProfileViewport;
  public tabId: string | null;
  public kind: BlockKind;
  public gridX: number;
  public gridY: number;
  public gridW: number;
  public gridH: number;
  public isVisible: boolean;
  public pinnedAllTabs: boolean;
  public config: unknown | null;

  constructor(props: ProfileBlockEntityProps) {
    super(props);
    this.userId = props.userId;
    this.viewport = props.viewport;
    this.tabId = props.tabId ?? null;
    this.kind = props.kind;
    this.gridX = props.gridX;
    this.gridY = props.gridY;
    this.gridW = props.gridW;
    this.gridH = props.gridH;
    this.isVisible = props.isVisible ?? true;
    this.pinnedAllTabs = props.pinnedAllTabs ?? false;
    this.config = props.config ?? null;
  }

  updateConfig(config: unknown | null) {
    this.config = config ?? null;
    this.updateTimestamp();
  }

  setVisibility(isVisible: boolean) {
    this.isVisible = isVisible;
    this.updateTimestamp();
  }

  /**
   * Pin the block across all tabs (tabId becomes null) or unpin it back into a
   * concrete tab. When unpinning, the caller must supply the destination tabId.
   */
  setPinned(pinned: boolean, tabId: string | null = null) {
    this.pinnedAllTabs = pinned;
    this.tabId = pinned ? null : tabId;
    this.updateTimestamp();
  }

  moveToTab(tabId: string) {
    this.tabId = tabId;
    this.pinnedAllTabs = false;
    this.updateTimestamp();
  }

  setPosition(position: BlockPosition) {
    this.gridX = position.gridX;
    this.gridY = position.gridY;
    this.gridW = position.gridW;
    this.gridH = position.gridH;
    this.updateTimestamp();
  }
}
