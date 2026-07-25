import type { AlbumRole } from "../types";

export function canManageAlbum(role?: AlbumRole) {
  return role === "owner" || role === "admin";
}

export function canInviteToAlbum(
  role?: AlbumRole,
  membersCanInvite = false,
) {
  return canManageAlbum(role) || (role === "member" && membersCanInvite);
}

export function canPostPhoto(role?: AlbumRole) {
  return canManageAlbum(role) || role === "member";
}

export function canEditPhoto(
  role: AlbumRole | undefined,
  currentUserID: string,
  authorID: string,
) {
  return canManageAlbum(role) || (role === "member" && authorID === currentUserID);
}

export function canDeletePhoto(
  role: AlbumRole | undefined,
  currentUserID: string,
  authorID: string,
) {
  return canManageAlbum(role) || authorID === currentUserID;
}
