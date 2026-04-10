export const permissionActions = [
  "view",
  "create",
  "edit",
  "delete",
  "manage",
] as const;
export type PermissionAction = (typeof permissionActions)[number];

export const permissionResources = [
  "workspace",
  "board",
  "list",
  "card",
  "comment",
  "member",
] as const;
export type PermissionResource = (typeof permissionResources)[number];

export const allPermissions = [
  "workspace:view",
  "workspace:edit",
  "workspace:delete",
  "workspace:manage",
  "board:view",
  "board:create",
  "board:edit",
  "board:delete",
  "list:view",
  "list:create",
  "list:edit",
  "list:delete",
  "card:view",
  "card:create",
  "card:edit",
  "card:delete",
  "card:attach",
  "card:tick",
  "comment:view",
  "comment:create",
  "comment:edit",
  "comment:delete",
  "member:view",
  "member:invite",
  "member:edit",
  "member:remove",
] as const;

export type Permission = (typeof allPermissions)[number];

export const roles = ["ADMIN", "NVKT_MANAGER", "NVKD_MANAGER", "NVVP"] as const;
export type Role = (typeof roles)[number];

export const roleHierarchy: Record<Role, number> = {
  ADMIN: 100,
  NVKT_MANAGER: 80,
  NVKD_MANAGER: 60,
  NVVP: 40,
} as const;

export const defaultRolePermissions: Record<Role, readonly Permission[]> = {
  ADMIN: allPermissions,
  NVKT_MANAGER: [
    "workspace:view",
    "board:view",
    "board:create",
    "board:edit",
    "list:view",
    "list:create",
    "list:edit",
    "list:delete",
    "card:view",
    "card:create",
    "card:edit",
    "card:delete",
    "card:attach",
    "card:tick",
    "comment:view",
    "comment:create",
    "comment:edit",
    "comment:delete",
    "member:view",
    "member:invite",
  ],
  NVKD_MANAGER: [
    "workspace:view",
    "board:view",
    "board:create",
    "list:view",
    "list:create",
    "list:edit",
    "card:view",
    "card:create",
    "card:edit",
    "card:attach",
    "card:tick",
    "comment:view",
    "comment:create",
    "comment:edit",
    "member:view",
  ],
  NVVP: [
    "workspace:view",
    "board:view",
    "list:view",
    "card:view",
    "card:create",
    "card:attach",
    "card:tick",
    "comment:view",
    "comment:create",
    "member:view",
  ],
} as const;


export const permissionCategories = {
  workspace: {
    label: "Workspace",
    permissions: [
      "workspace:view",
      "workspace:edit",
      "workspace:delete",
      "workspace:manage",
    ] as const,
  },
  board: {
    label: "Bảng",
    permissions: [
      "board:view",
      "board:create",
      "board:edit",
      "board:delete",
    ] as const,
  },
  list: {
    label: "Cột",
    permissions: [
      "list:view",
      "list:create",
      "list:edit",
      "list:delete",
    ] as const,
  },
  card: {
    label: "Thẻ",
    permissions: [
      "card:view",
      "card:create",
      "card:edit",
      "card:delete",
      "card:attach",
      "card:tick",
    ] as const,
  },
  comment: {
    label: "Bình luận",
    permissions: [
      "comment:view",
      "comment:create",
      "comment:edit",
      "comment:delete",
    ] as const,
  },
  member: {
    label: "Thành viên",
    permissions: [
      "member:view",
      "member:invite",
      "member:edit",
      "member:remove",
    ] as const,
  },
} as const;

export function getDefaultPermissions(role: Role): readonly Permission[] {
  return defaultRolePermissions[role];
}

export function getRoleLevel(role: Role): number {
  return roleHierarchy[role];
}

export function canManageRole(managerRole: Role, targetRole: Role): boolean {
  return roleHierarchy[managerRole] >= roleHierarchy[targetRole];
}

export function hasPermissionInDefaults(
  role: Role,
  permission: Permission,
): boolean {
  return defaultRolePermissions[role].includes(permission);
}

