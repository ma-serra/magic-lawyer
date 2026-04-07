"use client";

import { useEffect, useMemo, useState, type FocusEvent, type ReactNode } from "react";

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
  customValue?: string;
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
  isVirtualized?: boolean;
  allowsCustomValue?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  testId?: string;
  onSelectionChange: (key: string | null) => void;
  onCustomValueChange?: (value: string) => void;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findExactMatch(items: SearchableSelectOption[], value: string) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return undefined;
  }

  return items.find((item) => {
    const candidates = [item.label, item.textValue ?? item.label];
    return candidates.some(
      (candidate) => normalizeSearchText(candidate) === normalizedValue,
    );
  });
}

export function SearchableSelect({
  items,
  selectedKey,
  customValue,
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
  isVirtualized,
  allowsCustomValue = false,
  ariaLabel,
  ariaLabelledby,
  testId,
  onSelectionChange,
  onCustomValueChange,
}: SearchableSelectProps) {
  const itemKeys = new Set(items.map((item) => item.key));
  const normalizedSelectedKey =
    selectedKey !== null &&
    selectedKey !== undefined &&
    itemKeys.has(selectedKey)
      ? selectedKey
      : undefined;
  const selectedItem = useMemo(
    () =>
      normalizedSelectedKey
        ? items.find((item) => item.key === normalizedSelectedKey)
        : undefined,
    [items, normalizedSelectedKey],
  );
  const resolvedSelectedLabel =
    selectedItem?.label ?? (allowsCustomValue ? customValue ?? "" : "");
  const [inputValue, setInputValue] = useState(resolvedSelectedLabel);
  const filteredItems = useMemo(() => {
    const normalizedInput = normalizeSearchText(inputValue);

    if (!normalizedInput) {
      return items;
    }

    if (selectedItem && normalizeSearchText(selectedItem.label) === normalizedInput) {
      return items;
    }

    return items.filter((item) => {
      const haystack = normalizeSearchText(item.textValue ?? item.label);
      return haystack.includes(normalizedInput);
    });
  }, [inputValue, items, selectedItem]);

  useEffect(() => {
    setInputValue(resolvedSelectedLabel);
  }, [resolvedSelectedLabel]);

  const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
    inputProps?.onBlur?.(event);
    const trimmedValue = inputValue.trim();

    const exactMatch = findExactMatch(items, trimmedValue);
    if (exactMatch && exactMatch.key !== normalizedSelectedKey) {
      setInputValue(exactMatch.label);
      onSelectionChange(exactMatch.key);
      return;
    }

    if (allowsCustomValue) {
      setInputValue(trimmedValue);

      if (normalizedSelectedKey !== undefined && !exactMatch) {
        onSelectionChange(null);
      }

      onCustomValueChange?.(trimmedValue);
      return;
    }

    setInputValue(selectedItem?.label ?? "");
  };

  return (
    <Autocomplete
      allowsCustomValue={allowsCustomValue}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={className}
      classNames={classNames}
      color={color}
      data-testid={testId}
      description={description}
      errorMessage={errorMessage}
      id={id}
      inputValue={inputValue}
      inputProps={{
        autoComplete: "off",
        ...inputProps,
        onBlur: handleInputBlur,
      }}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isLoading={isLoading}
      isRequired={isRequired}
      isVirtualized={isVirtualized ?? filteredItems.length > 50}
      items={filteredItems}
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
      onClear={() => {
        setInputValue("");
        if (allowsCustomValue) {
          onSelectionChange(null);
          onCustomValueChange?.("");
        }
      }}
      onInputChange={(value) => {
        setInputValue(value);

        if (allowsCustomValue) {
          onCustomValueChange?.(value);
          return;
        }

        const exactMatch = findExactMatch(items, value);
        if (exactMatch && exactMatch.key !== normalizedSelectedKey) {
          onSelectionChange(exactMatch.key);
        }
      }}
      onSelectionChange={(key) => {
        const nextKey = typeof key === "string" ? key : null;
        const nextItem = nextKey
          ? items.find((item) => item.key === nextKey)
          : undefined;

        setInputValue(nextItem?.label ?? "");
        onSelectionChange(nextKey);
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
