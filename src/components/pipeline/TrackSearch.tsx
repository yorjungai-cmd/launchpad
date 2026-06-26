"use client";

/**
 * TrackSearch — reference number search form.
 *
 * User enters a reference number → navigates to /track/[refNum] where the
 * status + AI result are displayed.
 */

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TrackSearch({ locale }: { locale: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ref = value.trim().toUpperCase();
    if (!ref) {
      setError("กรุณากรอกหมายเลขอ้างอิง");
      return;
    }
    // Basic format check: LP-XXXXXXXX
    if (!/^LP-[A-Z0-9]{4,}$/.test(ref)) {
      setError("รูปแบบไม่ถูกต้อง — ควรเป็น LP-XXXXXXXX");
      return;
    }
    setError("");
    router.push(`/${locale}/track/${ref}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          placeholder="LP-XXXXXXXX"
          aria-label="หมายเลขอ้างอิง"
          className="font-mono uppercase"
          autoFocus
        />
        <Button type="submit">
          <Search className="mr-2 size-4" aria-hidden="true" />
          ค้นหา
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export default TrackSearch;
