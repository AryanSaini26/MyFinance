"use client";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
  Text,
  Progress,
} from "@chakra-ui/react";
import Card from "../components/card/Card";
import { api } from "@/lib/client-api";
import { useWorkspace, formatMoney } from "./context";
export default function Budgeting() {
  const w = useWorkspace();
  return (
    <Card>
      <Text fontSize="22px" fontWeight="700" mb="20px">
        Budget Section
      </Text>
      <Text color="secondaryGray.600" mb="20px">
        Monthly spending by category and currency
      </Text>
      {w.budgets
        .filter((b) => b.month === w.month && b.currency === w.currency)
        .map((b) => (
          <Box key={b.id} mb="24px">
            <Flex justify="space-between">
              <Text>{w.categoryName(b.category_id)}</Text>
              <Text>
                {formatMoney(b.spent, b.currency)} /{" "}
                {formatMoney(b.amount, b.currency)}
              </Text>
            </Flex>
            <Progress
              mt="12px"
              borderRadius="8px"
              colorScheme={
                Number(b.spent) > Number(b.amount) ? "red" : "brandScheme"
              }
              value={(Number(b.spent) / Number(b.amount)) * 100}
            />
          </Box>
        ))}
      <Box
        as="form"
        aria-label="Save budget"
        onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget as HTMLFormElement);
          w.action(async () => {
            await api("budgets", "POST", {
              categoryId: d.get("categoryId"),
              month: w.month,
              currency: w.currency,
              amount: d.get("amount"),
            });
          }, "Budget saved.");
        }}
      >
        <Flex gap="20px" wrap="wrap">
          <FormControl maxW="300px">
            <FormLabel>Category</FormLabel>
            <Select name="categoryId" required>
              {w.categories
                .filter((c) => !["income", "transfer"].includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </FormControl>
          <FormControl maxW="240px">
            <FormLabel>Monthly amount</FormLabel>
            <Input
              name="amount"
              aria-label="Monthly amount"
              placeholder="250.00"
              inputMode="decimal"
              required
              pattern="[0-9]+(\.[0-9]{1,2})?"
            />
          </FormControl>
        </Flex>
        <Button
          mt="20px"
          colorScheme="brandScheme"
          type="submit"
          isDisabled={w.busy}
        >
          Save budget for {w.month}
        </Button>
      </Box>
    </Card>
  );
}
