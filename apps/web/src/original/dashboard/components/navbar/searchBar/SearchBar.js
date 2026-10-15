import React from "react";
import { useRouter } from "next/navigation";
import {
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  useColorModeValue,
} from "@chakra-ui/react";
import { useWorkspace } from "@/original/dashboard/integration/context";
import { SearchIcon } from "@chakra-ui/icons";
export function SearchBar(props) {
  const workspace = useWorkspace();
  const router = useRouter();
  // Pass the computed styles into the `__css` prop
  const { variant, background, children, placeholder, borderRadius, ...rest } =
    props;
  // Chakra Color Mode
  const searchIconColor = useColorModeValue("gray.700", "white");
  const inputBg = useColorModeValue("secondaryGray.300", "navy.900");
  const inputText = useColorModeValue("gray.700", "gray.100");
  return (
    <InputGroup
      as="form"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/dashboard/transactions");
      }}
      w={{ base: "100%", md: "200px" }}
      {...rest}
    >
      <InputLeftElement
        children={
          <IconButton
            type="submit"
            aria-label="Search transactions"
            bg="inherit"
            borderRadius="inherit"
            _hover="none"
            _active={{
              bg: "inherit",
              transform: "none",
              borderColor: "transparent",
            }}
            _focus={{
              boxShadow: "none",
            }}
            icon={<SearchIcon color={searchIconColor} w="15px" h="15px" />}
          ></IconButton>
        }
      />
      <Input
        maxLength={100}
        aria-label="Search transactions"
        value={workspace.search}
        onChange={(e) => workspace.setSearch(e.target.value)}
        variant="search"
        fontSize="sm"
        bg={background ? background : inputBg}
        color={inputText}
        fontWeight="500"
        _placeholder={{ color: "gray.400", fontSize: "14px" }}
        borderRadius={borderRadius ? borderRadius : "30px"}
        placeholder={placeholder ? placeholder : "Search..."}
      />
    </InputGroup>
  );
}
