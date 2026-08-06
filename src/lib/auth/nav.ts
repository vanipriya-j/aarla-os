import type { AppRole } from "@/lib/auth/roles";
import {
  networkNav,
  outreachNav,
  primaryTiles,
  type NavItem,
} from "@/lib/navigation";

export type NavSections = {
  showHome: boolean;
  workflows: NavItem[];
  network: NavItem[];
  outreach: NavItem[];
};

/** CRM only sees Customer Calls; Diagnostics stays admin. */
export function navForRole(role: AppRole): NavSections {
  if (role === "crm") {
    return {
      showHome: false,
      workflows: [],
      network: [],
      outreach: outreachNav.filter((item) => item.href === "/customer-calls"),
    };
  }
  return {
    showHome: true,
    workflows: primaryTiles,
    network: networkNav,
    outreach: outreachNav,
  };
}
