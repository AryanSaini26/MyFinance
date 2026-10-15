"use client";
import {
  Box,
  Button,
  Flex,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  MdAddTask,
  MdAttachMoney,
  MdBarChart,
  MdFileCopy,
  MdOutlineCalendarToday,
} from "react-icons/md";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import Card from "../components/card/Card";
import MiniStatistics from "../components/card/MiniStatistics";
import IconBox from "../components/icons/IconBox";
import MiniCalendar from "../components/calendar/MiniCalendar";
import { useWorkspace, formatMoney } from "./context";
import { lineChartOptionsTotalSpent } from "../variables/charts";
export default function Overview() {
  const w = useWorkspace(),
    brandColor = useColorModeValue("brand.500", "white"),
    boxBg = useColorModeValue("secondaryGray.300", "whiteAlpha.100");
  const totals = w.summary.totals.find((t) => t.currency === w.currency),
    expenses = Number(totals?.expenses ?? 0),
    income = Number(totals?.income ?? 0);
  const spending = w.summary.spending.filter((s) => s.currency === w.currency),
    largest = [...spending].sort(
      (a, b) => Number(b.amount) - Number(a.amount),
    )[0];
  const months = w.analytics.months,
    previous = Number(months.at(-2)?.expenses ?? 0),
    growth =
      previous > 0
        ? (((expenses - previous) / previous) * 100).toFixed(1) + "%"
        : null;
  const pieOptions = {
    labels: spending.map((s) => w.categoryName(s.category_id)),
    colors: [
      "#00008B",
      "#1F75FE",
      "#74BBFB",
      "#0B0B3B",
      "#0000FF",
      "#0755b3",
      "#D633FF",
      "#33EFFF",
    ],
    chart: { background: "transparent" },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { theme: "dark" as const },
    stroke: { colors: ["#fff"] },
  };
  const originalOptions = lineChartOptionsTotalSpent as ApexOptions;
  const lineOptions: ApexOptions = {
    ...originalOptions,
    xaxis: {
      ...originalOptions.xaxis,
      type: "category",
      categories: months.map((m) =>
        new Date(m.month + "-01T00:00:00Z").toLocaleString("en-CA", {
          month: "short",
          timeZone: "UTC",
        }),
      ),
    },
  };
  return (
    <Box>
      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 3, "2xl": 6 }}
        gap="20px"
        mb="20px"
      >
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={
                <Icon w="32px" h="32px" as={MdBarChart} color={brandColor} />
              }
            />
          }
          name="Earnings"
          value={formatMoney(income, w.currency)}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={
                <Icon w="32px" h="32px" as={MdAttachMoney} color={brandColor} />
              }
            />
          }
          name="Expenses"
          value={formatMoney(expenses, w.currency)}
        />
        <MiniStatistics
          name="+/-"
          value={formatMoney(income - expenses, w.currency)}
        />
        <MiniStatistics
          name="Favourite Expense"
          value={largest ? w.categoryName(largest.category_id) : "—"}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg="linear-gradient(90deg, #4481EB 0%, #04BEFE 100%)"
              icon={<Icon w="28px" h="28px" as={MdAddTask} color="white" />}
            />
          }
          name="Transactions This Month"
          value={totals?.count ?? 0}
        />
        <MiniStatistics
          startContent={
            <IconBox
              w="56px"
              h="56px"
              bg={boxBg}
              icon={
                <Icon w="32px" h="32px" as={MdFileCopy} color={brandColor} />
              }
            />
          }
          name="Overall Transactions"
          value={w.analytics.allTimeCount}
        />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 2 }} gap="20px" mb="20px">
        <Card p="20px" align="center" direction="column" w="100%">
          <Flex
            px={{ base: "0px", "2xl": "10px" }}
            justify="space-between"
            w="100%"
            mb="8px"
          >
            <Text fontSize="md" fontWeight="600" mt="4px">
              Breakdown
            </Text>
            <Text fontSize="sm" fontWeight="700" color="secondaryGray.600">
              Monthly · {w.currency}
            </Text>
          </Flex>
          {spending.length ? (
            <Box w="100%" minH="260px">
              <Chart
                type="pie"
                series={spending.map((s) => Number(s.amount))}
                options={pieOptions}
                height={280}
              />
            </Box>
          ) : (
            <Text py="80px" color="secondaryGray.600">
              No posted spending this month.
            </Text>
          )}
          <Card
            bg="navy.700"
            flexDirection="row"
            w="100%"
            p="15px"
            px="20px"
            mt="15px"
          >
            <Flex direction="column">
              <Text
                fontSize="xs"
                color="secondaryGray.600"
                fontWeight="700"
                mb="5px"
              >
                Highest
              </Text>
              <Text fontSize="lg" fontWeight="700">
                {largest && expenses > 0
                  ? ((Number(largest.amount) / expenses) * 100).toFixed(2) + "%"
                  : "—"}
              </Text>
            </Flex>
          </Card>
        </Card>
        <Card
          justifyContent="center"
          align="center"
          direction="column"
          w="100%"
        >
          <Flex justify="space-between" ps="0px" pe="20px" pt="5px" w="100%">
            <Button
              bg={boxBg}
              fontSize="sm"
              fontWeight="500"
              color="secondaryGray.600"
              borderRadius="7px"
              leftIcon={<Icon as={MdOutlineCalendarToday} />}
              onClick={() => w.setMonth(new Date().toISOString().slice(0, 7))}
            >
              This month
            </Button>
            <Icon as={MdBarChart} w="24px" h="24px" />
          </Flex>
          <Flex w="100%" flexDirection={{ base: "column", lg: "row" }}>
            <Flex flexDirection="column" me="20px" mt="28px">
              <Text fontSize="34px" fontWeight="700" lineHeight="100%">
                {formatMoney(expenses, w.currency)}
              </Text>
              <Text fontSize="sm" fontWeight="700" color="green.500" mt="8px">
                {growth ?? "No previous-month comparison"}
              </Text>
            </Flex>
            <Box minH="260px" minW="70%" flex="1" mt="auto">
              <Chart
                type="line"
                series={[
                  {
                    name: "Earnings",
                    data: months.map((m) => Number(m.income)),
                  },
                  {
                    name: "Expenses",
                    data: months.map((m) => Number(m.expenses)),
                  },
                ]}
                options={lineOptions}
                height={280}
              />
            </Box>
          </Flex>
        </Card>
        <MiniCalendar h="100%" minW="100%" selectRange={false} />
      </SimpleGrid>
    </Box>
  );
}
