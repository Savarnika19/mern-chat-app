import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    Text,
} from "@chakra-ui/react";

const SummarizeModal = ({ isOpen, onClose, summary, loading }) => {
    return (
        <Modal size="lg" onClose={onClose} isOpen={isOpen} isCentered>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader
                    fontSize="30px"
                    fontFamily="Work sans"
                    d="flex"
                    justifyContent="center"
                >
                    Message Summary
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody
                    d="flex"
                    flexDir="column"
                    alignItems="center"
                    justifyContent="space-between"
                >
                    {loading ? (
                        <Text>Generating summary...</Text>
                    ) : (
                        <Text fontSize="18px" fontFamily="Work sans">
                            {summary || "No summary available."}
                        </Text>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button onClick={onClose} colorScheme="blue">
                        Close
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default SummarizeModal;
