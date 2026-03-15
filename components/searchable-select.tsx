"use client";

import type { ReactNode } from "react";

import {
  Autocomplete,
  AutocompleteItem,
  type AutocompleteProps,
} from "@heroui/react";

export type SearchableSelectOption = {
  key: string;
  label: string;
  textValue?: string;
  description?: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
  disabled?: boolean;
};

type SearchableSelectProps = {
  items: SearchableSelectOption[];
  selectedKey?: string | null;
  id?: string;
  label?: string;
  placeholder?: string;
  description?: ReactNode;
  errorMessage?: ReactNode;
  emptyContent?: ReactNode;
  startContent?: ReactNode;
  className?: string;
  classNames?: AutocompleteProps<SearchableSelectOption>["classNames"];
  inputProps?: AutocompleteProps<SearchableSelectOption>["inputProps"];
  listboxProps?: AutocompleteProps<SearchableSelectOption>["listboxProps"];
  popoverProps?: AutocompleteProps<SearchableSelectOption>["popoverProps"];
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  variant?: "flat" | "bordered" | "faded" | "underlined";
  radius?: "none" | "sm" | "md" | "lg" | "full";
  isRequired?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  testId?: string;
  onSelectionChange: (key: string | null) => void;
};

export function SearchableSelect({
  items,
  selectedKey,
  id,
  label,
  placeholder,
  description,
  errorMessage,
  emptyContent = "Nenhuma opcao encontrada",
  startContent,
  className,
  classNames,
  inputProps,
  listboxProps,
  popoverProps,
  color,
  size = "md",
  variant = "bordered",
  radius = "md",
  isRequired = false,
  isDisabled = false,
  isLoading = false,
  isClearable = true,
  ariaLabel,
  ariaLabelledby,
  testId,
  onSelectionChange,
}: SearchableSelectProps) {
  const itemKeys = new Set(items.map((item) => item.key));
  const normalizedSelectedKey =
    selectedKey !== null &&
    selectedKey !== undefined &&
    itemKeys.has(selectedKey)
      ? selectedKey
      : undefined;

  return (
    <Autocomplete
      allowsCustomValue={false}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={className}
      classNames={classNames}
      color={color}
      data-testid={testId}
      description={description}
      errorMessage={errorMessage}
      id={id}
      inputProps={{
        autoComplete: "off",
        ...inputProps,
      }}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isLoading={isLoading}
      isRequired={isRequired}
      isVirtualized={items.length > 50}
      items={items}
      label={label}
      listboxProps={{
        emptyContent,
        ...listboxProps,
      }}
      maxListboxHeight={320}
      itemHeight={48}
      placeholder={placeholder}
      popoverProps={popoverProps}
      radius={radius}
      selectedKey={normalizedSelectedKey}
      size={size}
      startContent={startContent}
      variant={variant}
      onSelectionChange={(key) => {
        onSelectionChange(typeof key === "string" ? key : null);
      }}
    >
      {(item) => (
        <AutocompleteItem
          key={item.key}
          isDisabled={item.disabled}
          textValue={item.textValue ?? item.label}
        >
          <div className="flex items-start gap-2">
            {item.startContent}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.label}</div>
              {item.description ? (
                <div className="mt-0.5 text-xs text-default-500">
                  {item.description}
                </div>
              ) : null}
            </div>
            {item.endContent}
          </div>
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}
