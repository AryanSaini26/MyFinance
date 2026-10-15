"use client";
import {
  Box,
  ChakraProvider,
  extendTheme,
  Alert,
  AlertIcon,
  Flex,
  Input,
  Select,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import theme from "../theme/theme";
import Sidebar from "../components/sidebar/Sidebar";
import Navbar from "../components/navbar/NavbarAdmin";
import Footer from "../components/footer/FooterAdmin";
import routes from "./routes";
import { WorkspaceProvider, useWorkspace } from "./context";
import Overview from "./overview";
import Transactions from "./transactions";
import Budgeting from "./budgeting";
import Profile from "./profile";
const originalTheme = extendTheme(theme, {
  config: { initialColorMode: "dark", useSystemColorMode: false },
});
const colorModeManager = {
  type: "localStorage" as const,
  get: () => "dark" as const,
  set: () => {},
};
function Pages() {
  const w = useWorkspace(),
    path = usePathname();
  if (!w.ready || !w.user)
    return (
      <Box bg="navy.900" color="white" minH="100vh" p="40px">
        {w.error ? <Text role="alert">{w.error}</Text> : <Spinner />}
      </Box>
    );
  const selected = routes.find((r) => r.href === path) ?? routes[0];
  return (
    <Box>
      <Sidebar routes={routes} />
      <Box
        float="right"
        minHeight="100vh"
        height="100%"
        position="relative"
        w={{ base: "100%", xl: "calc(100% - 290px)" }}
        maxWidth={{ base: "100%", xl: "calc(100% - 290px)" }}
      >
        <Navbar brandText={selected.name} onOpen={() => {}} />
        <Box
          mx="auto"
          px={{ base: "20px", md: "30px" }}
          pe="20px"
          minH="100vh"
          pt={{ base: "160px", md: "120px" }}
        >
          <Box>
            <Flex gap="12px" justify="flex-end" mb="20px" wrap="wrap">
              <Input
                type="month"
                min="0001-01"
                max="9999-12"
                aria-label="Reporting month"
                value={w.month}
                onChange={(e) => e.target.value && w.setMonth(e.target.value)}
                maxW="180px"
                color="white"
              />
              <Select
                aria-label="Reporting currency"
                value={w.currency}
                onChange={(e) => w.setCurrency(e.target.value)}
                maxW="100px"
              >
                <option>CAD</option>
                <option>USD</option>
              </Select>
            </Flex>
            {w.error && (
              <Alert status="error" mb="20px" borderRadius="12px" role="alert">
                <AlertIcon />
                {w.error}
              </Alert>
            )}
            {w.notice && (
              <Alert
                status="success"
                mb="20px"
                borderRadius="12px"
                role="status"
              >
                <AlertIcon />
                {w.notice}
              </Alert>
            )}
            {path.endsWith("/transactions") ? (
              <Transactions />
            ) : path.endsWith("/budget") ? (
              <Budgeting />
            ) : path.endsWith("/profile") ? (
              <Profile />
            ) : (
              <Overview />
            )}
          </Box>
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
export default function Dashboard() {
  return (
    <ChakraProvider theme={originalTheme} colorModeManager={colorModeManager}>
      <WorkspaceProvider>
        <Pages />
      </WorkspaceProvider>
    </ChakraProvider>
  );
}
