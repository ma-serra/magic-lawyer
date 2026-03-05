"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Calendar } from "lucide-react";

import GoogleCalendarIntegration from "./google-calendar-integration";
import GoogleIcon from "./google-icon";

export default function GoogleCalendarButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Botão do Google Calendar */}
      <Button
        className="h-8 min-h-8 w-full sm:w-auto"
        color="secondary"
        size="sm"
        startContent={<GoogleIcon className="w-4 h-4" />}
        variant="bordered"
        onPress={() => setIsOpen(true)}
      >
        Google Calendar
      </Button>

      {/* Modal do Google Calendar */}
      <Modal
        classNames={{
          base: "max-h-[80vh]",
          body: "py-6",
        }}
        isOpen={isOpen}
        scrollBehavior="inside"
        size="2xl"
        onOpenChange={setIsOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <GoogleIcon className="w-5 h-5" />
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>Google Calendar</span>
                </div>
              </ModalHeader>
              <ModalBody>
                <GoogleCalendarIntegration />
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose}>
                  Fechar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
