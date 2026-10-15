"use client";
import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Input,
  Select,
  Text,
} from "@chakra-ui/react";
import { usePlaidLink } from "react-plaid-link";
import Banner from "../views/admin/profile/components/Banner";
import Card from "../components/card/Card";
import { api } from "@/lib/client-api";
import { useWorkspace, formatMoney } from "./context";
function PlaidLink({
  token,
  success,
  onError,
}: {
  token: string;
  success: (token: string) => void;
  onError: (message: string) => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: success,
    onExit: (error) =>
      error && onError(error.display_message ?? "Bank connection closed"),
  });
  return (
    <Button mt="12px" isDisabled={!ready} onClick={() => open()}>
      Open Plaid Sandbox Link
    </Button>
  );
}
export default function Profile() {
  const w = useWorkspace(),
    [link, setLink] = useState("");
  return (
    <Grid templateColumns={{ base: "1fr", lg: "1.1fr 1.8fr" }} gap="20px">
      <Banner
        banner="/original/dashboard/banner.png"
        avatar={undefined}
        name={w.user?.name ?? w.user?.email}
        job={w.user?.name ? w.user.email : "MyFinance User"}
      />
      <Card>
        <Flex justify="space-between" align="center" mb="20px">
          <Text fontSize="22px" fontWeight="700">
            Accounts & connections
          </Text>
          <Button
            isDisabled={w.busy}
            onClick={() =>
              w.action(async () => {
                const result = await api<{ mode: string; link_token: string }>(
                  "plaid/link-token",
                  "POST",
                );
                w.setMode(result.mode);
                if (result.mode === "mock") {
                  await api("plaid/exchange", "POST", {
                    publicToken: "mock-public",
                  });
                } else setLink(result.link_token);
              }, "Institution connected. Choose Sync to retrieve transactions.")
            }
          >
            Connect institution
          </Button>
        </Flex>
        <Text color="secondaryGray.600" mb="12px">
          {w.mode === "mock" ? "Simulated data" : "Plaid Sandbox"}
        </Text>
        {link && (
          <PlaidLink
            token={link}
            onError={w.setError}
            success={(token) =>
              w.action(async () => {
                await api("plaid/exchange", "POST", { publicToken: token });
                setLink("");
              }, "Institution connected. Choose Sync to retrieve transactions.")
            }
          />
        )}
        {w.items.map((i) => (
          <Box
            key={i.id}
            mb="20px"
            borderBottom="1px solid"
            borderColor="whiteAlpha.100"
            pb="16px"
          >
            <Text fontWeight="700">{i.institution_name}</Text>
            <Text fontSize="sm" color="secondaryGray.600" my="8px">
              {i.status} ·{" "}
              {i.last_synced_at
                ? "Synced " + new Date(i.last_synced_at).toLocaleString()
                : "Not synchronized yet"}
              {i.last_error ? " · Last synchronization failed" : ""}
            </Text>
            <Flex gap="10px">
              <Button
                size="sm"
                isDisabled={w.busy || i.status !== "active"}
                onClick={() =>
                  w.action(async () => {
                    await api("items/" + i.id + "/sync", "POST");
                  }, "Synchronization complete.")
                }
              >
                Sync
              </Button>
              <Button
                size="sm"
                variant="outline"
                isDisabled={w.busy || i.status === "disconnected"}
                onClick={() =>
                  w.action(async () => {
                    await api("items/" + i.id, "DELETE");
                  })
                }
              >
                {i.status === "disconnecting"
                  ? "Retry disconnect"
                  : "Disconnect"}
              </Button>
            </Flex>
          </Box>
        ))}
        {w.accounts.map((a) => (
          <Flex key={a.id} justify="space-between" my="16px" gap="15px">
            <Box>
              <Text fontWeight="700">
                {a.name}
                {!a.active ? " (disconnected)" : ""}
              </Text>
              <Text fontSize="sm" color="secondaryGray.600">
                {a.type} · {a.currency}
              </Text>
            </Box>
            <Text>
              {a.current_balance === null
                ? "Manual account"
                : formatMoney(a.current_balance, a.currency)}
            </Text>
          </Flex>
        ))}
        <Box
          as="form"
          mt="20px"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget as HTMLFormElement);
            w.action(async () => {
              await api("accounts", "POST", {
                name: d.get("name"),
                currency: d.get("currency"),
              });
            }, "Account added.");
          }}
        >
          <Text fontWeight="700" mb="12px">
            Add a manual account
          </Text>
          <Flex gap="12px" wrap="wrap">
            <FormControl flex="1">
              <FormLabel>Name</FormLabel>
              <Input name="name" required maxLength={100} />
            </FormControl>
            <FormControl maxW="100px">
              <FormLabel>Currency</FormLabel>
              <Select name="currency">
                <option>CAD</option>
                <option>USD</option>
              </Select>
            </FormControl>
          </Flex>
          <Button mt="16px" type="submit" isDisabled={w.busy}>
            Add account
          </Button>
        </Box>
      </Card>
    </Grid>
  );
}
