import type { AppRole } from "@/lib/auth/roles";
import type { AccessRoleCode } from "@/lib/domain/team-types";
import {
  adminNav,
  createNav,
  operateNav,
  type NavItem,
} from "@/lib/navigation";
import { teamCanAccessPath } from "@/lib/auth/team-access";

export type NavSections = {
  showHome: boolean;
  operate: NavItem[];
  create: NavItem[];
  admin: NavItem[];
};

function filterByAccess(
  items: NavItem[],
  accessRoleCodes: AccessRoleCode[],
): NavItem[] {
  return items.filter((item) => teamCanAccessPath(accessRoleCodes, item.href));
}

/** CRM only sees Customer Calls; Team sees permission-gated nav; Admin sees full OS. */
export function navForRole(
  role: AppRole,
  accessRoleCodes: AccessRoleCode[] = [],
): NavSections {
  if (role === "crm") {
    return {
      showHome: false,
      operate: operateNav.filter((item) => item.href === "/customer-calls"),
      create: [],
      admin: [],
    };
  }
  if (role === "team") {
    return {
      showHome: teamCanAccessPath(accessRoleCodes, "/"),
      operate: filterByAccess(operateNav, accessRoleCodes),
      create: filterByAccess(createNav, accessRoleCodes),
      admin: filterByAccess(adminNav, accessRoleCodes),
    };
  }
  return {
    showHome: true,
    operate: operateNav,
    create: createNav,
    admin: adminNav,
  };
}
