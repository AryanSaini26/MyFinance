"use client";
import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Icon,
  Input,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { MdUpload } from "react-icons/md";
import Card from "../components/card/Card";
import { api } from "@/lib/client-api";
import { useWorkspace, formatMoney } from "./context";
export default function Transactions() {
  const w = useWorkspace(),
    [file, setFile] = useState<File | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID());
  const manual = w.accounts.filter((a) => !a.item_id && a.active);
  return (
    <Grid
      templateColumns={{ base: "1fr", xl: "60% 40%" }}
      gap="20px"
      maxW="100%"
    >
      <Box>
        <Card direction="column" w="100%" px="0px" overflowX="auto">
          <Flex px="25px" justify="space-between" mb="20px" align="center">
            <Text fontSize="22px" fontWeight="700" lineHeight="100%">
              Transactions
            </Text>
          </Flex>
          <Flex px="25px" gap="12px" mb="20px" wrap="wrap" className="filters">
            <FormControl flex="1">
              <FormLabel>Account</FormLabel>
              <Select
                aria-label="Account filter"
                value={w.accountFilter}
                onChange={(e) => w.setAccountFilter(e.target.value)}
              >
                <option value="">All accounts</option>
                {w.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl flex="1">
              <FormLabel>Category</FormLabel>
              <Select
                aria-label="Category filter"
                value={w.categoryFilter}
                onChange={(e) => w.setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {w.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormControl>
          </Flex>
          <Table variant="simple" color="gray.500" mb="24px">
            <Thead>
              <Tr>
                {["TRANSACTION", "KEYWORD", "DATE", "AMOUNT", "CATEGORY"].map(
                  (h) => (
                    <Th
                      key={h}
                      pe="10px"
                      borderColor="whiteAlpha.100"
                      fontSize={{ base: "10px", lg: "12px" }}
                      color="gray.400"
                    >
                      {h}
                    </Th>
                  ),
                )}
              </Tr>
            </Thead>
            <Tbody>
              {w.entries.map((t) => (
                <Tr key={t.id}>
                  <Td borderColor="transparent">
                    <Text fontSize="sm" fontWeight="700" color="white">
                      {t.description}
                    </Text>
                    <Text fontSize="xs" color="secondaryGray.600">
                      {t.source}
                      {t.pending ? " · pending" : ""}
                      {t.category_override_id
                        ? " · manual category"
                        : " · predicted"}
                    </Text>
                  </Td>
                  <Td borderColor="transparent" color="white" fontSize="sm">
                    {t.description.split(/\s+/)[0]}
                  </Td>
                  <Td
                    borderColor="transparent"
                    color="white"
                    fontSize="sm"
                    whiteSpace="nowrap"
                  >
                    {t.date}
                  </Td>
                  <Td
                    borderColor="transparent"
                    color={Number(t.amount) >= 0 ? "green.400" : "white"}
                    fontSize="sm"
                    whiteSpace="nowrap"
                  >
                    {formatMoney(t.amount, t.currency)}
                  </Td>
                  <Td borderColor="transparent">
                    <Select
                      aria-label={"Category for " + t.description}
                      size="sm"
                      minW="160px"
                      color="white"
                      value={t.category_override_id ?? ""}
                      isDisabled={w.busy}
                      onChange={(e) =>
                        w.action(async () => {
                          await api("transactions/" + t.id, "PATCH", {
                            categoryId: e.target.value || null,
                          });
                        })
                      }
                    >
                      <option value="">
                        Auto: {w.categoryName(t.predicted_category_id)}
                      </option>
                      {w.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!w.entries.length && (
            <Text py="30px" textAlign="center" color="secondaryGray.600">
              No transactions match these filters.
            </Text>
          )}
          <Flex px="25px" align="center" justify="flex-end" gap="12px">
            <Button
              size="sm"
              isDisabled={w.busy || w.offset === 0}
              onClick={() => w.setOffset(Math.max(0, w.offset - 50))}
            >
              Previous
            </Button>
            <Text fontSize="sm">Page {w.offset / 50 + 1}</Text>
            <Button
              size="sm"
              isDisabled={w.busy || w.entries.length < 50}
              onClick={() => w.setOffset(w.offset + 50)}
            >
              Next
            </Button>
          </Flex>
        </Card>
      </Box>
      <Box>
        <Card
          mb="20px"
          align="center"
          p="20px"
          aria-label="Upload Bank Statement"
          role="region"
        >
          <Flex h="100%" direction={{ base: "column", "2xl": "row" }}>
            <Flex
              position="relative"
              align="center"
              justify="center"
              bg="navy.700"
              border="1px dashed"
              borderColor="whiteAlpha.100"
              borderRadius="16px"
              w="100%"
              minH="260px"
              me="36px"
              cursor="pointer"
            >
              <Input
                type="file"
                aria-label="CSV file"
                accept=".csv,text/csv"
                position="absolute"
                inset="0"
                h="100%"
                w="100%"
                opacity="0"
                cursor="pointer"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Box textAlign="center" pointerEvents="none">
                <Icon as={MdUpload} w="80px" h="80px" />
                <Text fontSize="xl" fontWeight="700" mb="12px">
                  Upload Files
                </Text>
                <Text fontSize="sm" color="secondaryGray.500">
                  Only CSV files are allowed
                </Text>
              </Box>
            </Flex>
            <Flex direction="column" pe="24px">
              <Text
                fontWeight="bold"
                fontSize="2xl"
                mt={{ base: "20px", "2xl": "50px" }}
              >
                Upload Bank Statement
              </Text>
              <Text color="gray.400" fontSize="md" my="10px">
                Effortlessly upload your bank statements for seamless financial
                tracking and analysis with our 'Upload Bank Statement' feature
              </Text>
              <Text fontSize="xs" color="secondaryGray.600" mb="12px">
                CSV headers: date,description,amount,external_id. Maximum 1 MB /
                1,000 rows.
              </Text>
              <FormControl>
                <FormLabel>Import account</FormLabel>
                <Select id="import-account" aria-label="Import account">
                  {manual.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </Select>
              </FormControl>
              {file && (
                <>
                  <Text my="12px" fontSize="sm">
                    {file.name}
                  </Text>
                  <Button
                    colorScheme="blue"
                    isDisabled={w.busy}
                    onClick={() =>
                      w.action(async () => {
                        if (file.size > 1_000_000)
                          throw new Error("CSV must be at most 1 MB");
                        const accountId = (
                          document.getElementById(
                            "import-account",
                          ) as HTMLSelectElement
                        ).value;
                        const r = await api<{
                          inserted: number;
                          duplicates: number;
                        }>("imports/csv", "POST", {
                          accountId,
                          csv: await file.text(),
                        });
                        setFile(null);
                        w.setCategoryFilter("");
                        return void r;
                      }, "CSV imported. Repeated external IDs are skipped.")
                    }
                  >
                    Submit
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
        </Card>
        <Card aria-label="Add a transaction" role="region">
          <Text fontSize="22px" fontWeight="700" mb="20px">
            Add a transaction
          </Text>
          <Box
            as="form"
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const form = e.currentTarget as HTMLFormElement,
                d = new FormData(form);
              w.action(async () => {
                await api("transactions", "POST", {
                  accountId: d.get("accountId"),
                  description: d.get("description"),
                  amount: d.get("amount"),
                  date: d.get("date"),
                  idempotencyKey: key,
                });
                setKey(crypto.randomUUID());
                form.reset();
              }, "Transaction added.");
            }}
          >
            <FormControl mb="16px">
              <FormLabel>Manual account</FormLabel>
              <Select name="accountId" required>
                {manual.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl mb="16px">
              <FormLabel>Description</FormLabel>
              <Input
                name="description"
                aria-label="Description"
                maxLength={300}
                required
              />
            </FormControl>
            <Flex gap="12px" mb="16px">
              <FormControl>
                <FormLabel>Amount</FormLabel>
                <Input
                  name="amount"
                  aria-label="Amount"
                  placeholder="-12.50"
                  inputMode="decimal"
                  pattern="-?[0-9]+(\.[0-9]{1,2})?"
                  required
                />
              </FormControl>
              <FormControl>
                <FormLabel>Date</FormLabel>
                <Input
                  type="date"
                  name="date"
                  aria-label="Date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </FormControl>
            </Flex>
            <Button type="submit" isDisabled={w.busy}>
              Save transaction
            </Button>
          </Box>
        </Card>
      </Box>
    </Grid>
  );
}
