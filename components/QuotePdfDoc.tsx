// components/QuotePdfDoc.tsx
"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

type Quote = {
  id: string;
  recommended_total: number;
  total_amount: number;
  note: string | null;
};

type QuoteItem = {
  id: string;
  item_name: string;
  description: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  sort_order: number;
};

type Payment = {
  id: string;
  seq: number;
  title: string;
  due_date: string | null;
  percent: number;
  amount: number;
  paid: boolean;
};

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 11 },
  h1: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  h2: { fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 6 },
  small: { fontSize: 10, color: "#666" },
  row: { flexDirection: "row" },
  card: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 6 },
  table: { borderWidth: 1, borderColor: "#ddd" },
  th: {
    backgroundColor: "#f3f3f3",
    fontWeight: "bold",
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#ddd",
  },
  td: {
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#eee",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  col1: { width: "44%" },
  col2: { width: "12%", textAlign: "right" },
  col3: { width: "14%", textAlign: "right" },
  col4: { width: "14%", textAlign: "right" },
  col5: { width: "16%", textAlign: "right" },
});

function money(v: any) {
  const x = Number(v || 0);
  return x.toFixed(2);
}

export default function QuotePdfDoc(props: {
  projectName?: string;
  projectAddress?: string;
  quote: Quote;
  items: QuoteItem[];
  payments: Payment[];
}) {
  const { projectName, projectAddress, quote, items, payments } = props;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Quote / Quotation</Text>
        <Text style={styles.small}>Generated: {dateStr}</Text>

        <View style={{ height: 10 }} />

        <View style={styles.card}>
          <Text style={{ fontWeight: "bold" }}>Project Summary</Text>
          <View style={{ height: 6 }} />
          <Text>Client: {projectName || "-"}</Text>
          <Text>Address: {projectAddress || "-"}</Text>
          <Text>Quote ID: {quote.id}</Text>
        </View>

        <Text style={styles.h2}>Summary</Text>
        <View style={styles.card}>
          <Text>Total (DB): NZD {money(quote.total_amount)}</Text>
          <Text>Recommended (Manual): NZD {money(quote.recommended_total)}</Text>
          {!!quote.note && <Text>Note: {quote.note}</Text>}
        </View>

        <Text style={styles.h2}>Itemised Quote</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.th, styles.col1]}>Item</Text>
            <Text style={[styles.th, styles.col2]}>Qty</Text>
            <Text style={[styles.th, styles.col3]}>Unit</Text>
            <Text style={[styles.th, styles.col4]}>Amount</Text>
            <Text style={[styles.th, styles.col5]}>Description</Text>
          </View>

          {items
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it) => (
              <View key={it.id} style={styles.row}>
                <Text style={[styles.td, styles.col1]}>{it.item_name}</Text>
                <Text style={[styles.td, styles.col2]}>{String(it.qty ?? 0)}</Text>
                <Text style={[styles.td, styles.col3]}>NZD {money(it.unit_price)}</Text>
                <Text style={[styles.td, styles.col4]}>NZD {money(it.amount)}</Text>
                <Text style={[styles.td, styles.col5]}>{it.description || "-"}</Text>
              </View>
            ))}
        </View>

        <Text style={styles.h2}>Payment Schedule</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.th, { width: "10%" }]}>#</Text>
            <Text style={[styles.th, { width: "34%" }]}>Title</Text>
            <Text style={[styles.th, { width: "18%" }]}>Due</Text>
            <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>Percent</Text>
            <Text style={[styles.th, { width: "20%", textAlign: "right" }]}>Amount</Text>
          </View>

          {payments
            .slice()
            .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
            .map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={[styles.td, { width: "10%" }]}>{String(p.seq)}</Text>
                <Text style={[styles.td, { width: "34%" }]}>{p.title}</Text>
                <Text style={[styles.td, { width: "18%" }]}>{p.due_date || "-"}</Text>
                <Text style={[styles.td, { width: "18%", textAlign: "right" }]}>
                  {(Number(p.percent) || 0).toFixed(2)}%
                </Text>
                <Text style={[styles.td, { width: "20%", textAlign: "right" }]}>
                  NZD {money(p.amount)}
                </Text>
              </View>
            ))}
        </View>
      </Page>
    </Document>
  );
}