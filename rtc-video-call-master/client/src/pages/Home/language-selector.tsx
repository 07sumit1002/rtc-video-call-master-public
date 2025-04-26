"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MdCheck, MdKeyboardArrowDown } from "react-icons/md";
import { useState } from "react";
import { LanguageCodes } from "@/constants/Language";

interface LanguageSelectorProps {
  onLanguageChange: (language: string) => void;
  selectedLanguage: string;
}

const LanguageSelector = ({
  onLanguageChange,
  selectedLanguage,
}: LanguageSelectorProps) => {
  const [open, setOpen] = useState(false);

  // Get the language name from the selected language code
  const getLanguageName = (code: string) => {
    return LanguageCodes[code] || "English";
  };

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-2 border-teal-600 text-teal-600"
          >
            <span className="font-medium">
              {getLanguageName(selectedLanguage)}
            </span>
            <MdKeyboardArrowDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[200px]" align="center">
          <Command>
            <CommandInput placeholder="Search language..." />
            <CommandList>
              <CommandEmpty>No language found.</CommandEmpty>
              <CommandGroup>
                {Object.entries(LanguageCodes).map(([code, name]) => (
                  <CommandItem
                    key={code}
                    onSelect={() => {
                      onLanguageChange(code);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1">{name}</span>
                    {selectedLanguage === code && (
                      <MdCheck className="ml-auto h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default LanguageSelector;
