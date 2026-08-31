import type { AppRole } from "@/lib/auth/roles";
import {
  adminNav,
  createNav,
  operateNav,
  type NavItem,
} from "@/lib/navigation";

export type NavSections = {
  showHome: boolean;
  operate: NavItem[];
  create: NavItem[];
  admin: NavItem[];
};

/** CRM only sees Customer Calls; Admin sees full OS. */
export function navForRole(role: AppRole): NavSections {
  if (role === "crm") {
    return {
      showHome: false,
      operate: operateNav.filter((item) => item.href === "/customer-calls"),
      create: [],
      admin: [],
    };
  }
  return {
    showHome: true,
    operate: operateNav,
    create: createNav,
    admin: adminNav,
  };
}
