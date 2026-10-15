import { Icon } from "@chakra-ui/react";
import { MdHome, MdBarChart, MdAttachMoney, MdPerson } from "react-icons/md";
export const routes = [
  {
    name: "Dashboard",
    layout: "/admin",
    path: "/dashboard",
    href: "/dashboard",
    icon: <Icon as={MdHome} width="20px" height="20px" color="inherit" />,
  },
  {
    name: "Transactions",
    layout: "/admin",
    path: "/transactions",
    href: "/dashboard/transactions",
    icon: <Icon as={MdBarChart} width="20px" height="20px" color="inherit" />,
  },
  {
    name: "Budget",
    layout: "/admin",
    path: "/budget",
    href: "/dashboard/budget",
    icon: (
      <Icon as={MdAttachMoney} width="20px" height="20px" color="inherit" />
    ),
  },
  {
    name: "Profile",
    layout: "/admin",
    path: "/profile",
    href: "/dashboard/profile",
    icon: <Icon as={MdPerson} width="20px" height="20px" color="inherit" />,
  },
];
export default routes;
