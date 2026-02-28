import {
  Box,
  Container,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useEffect } from "react";
import { useHistory } from "react-router";
import Login from "../components/Authentication/Login";
import Signup from "../components/Authentication/Signup";
import { motion } from "framer-motion";

function Homepage() {
  const history = useHistory();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("userInfo"));

    if (user) history.push("/chats");
  }, [history]);

  return (
    <Container maxW="xl" centerContent>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ width: "100%" }}
      >
        <Box
          d="flex"
          flexDir="column"
          justifyContent="center"
          alignItems="center"
          p={3}
          bg={"rgba(255, 255, 255, 0.3)"}
          w="100%"
          m="40px 0 15px 0"
          borderRadius="lg"
          borderWidth="1px"
          borderColor={"rgba(255, 255, 255, 0.5)"}
          backdropFilter="blur(10px)"
          boxShadow="0 8px 32px 0 rgba(31, 38, 135, 0.37)"
        >
          <Text fontSize="4xl" fontFamily="Outfit" color="white" fontWeight="bold">
            Talk-A-Tive
          </Text>
        </Box>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        style={{ width: "100%" }}
      >
        <Box
          bg="rgba(255, 255, 255, 0.3)"
          w="100%"
          p={4}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={"rgba(255, 255, 255, 0.5)"}
          backdropFilter="blur(10px)"
          boxShadow="0 8px 32px 0 rgba(31, 38, 135, 0.37)"
          color="black"
        >
          <Tabs isFitted variant="soft-rounded" colorScheme="purple">
            <TabList mb="1em">
              <Tab color="white" _selected={{ color: "black", bg: "white" }}>Login</Tab>
              <Tab color="white" _selected={{ color: "black", bg: "white" }}>Sign Up</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <Login />
              </TabPanel>
              <TabPanel>
                <Signup />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </motion.div>
    </Container>
  );
}

export default Homepage;
