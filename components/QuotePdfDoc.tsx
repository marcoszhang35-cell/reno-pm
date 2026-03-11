import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

type Quote = {
  id: string;
  project_id: string;
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
  cost_price?: number;
};

function money(v: number) {
  return `NZD ${Number(v || 0).toFixed(2)}`;
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 12,
  },
  logo: {
    width: 120,
    height: 48,
    objectFit: "contain",
  },
  titleWrap: {
    textAlign: "right",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 10,
    color: "#52525b",
  },

  infoBlock: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    padding: 10,
    borderRadius: 4,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  label: {
    width: 100,
    fontWeight: 700,
  },
  value: {
    flex: 1,
  },

  table: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d8",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  bodyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },

  col1: {
    width: "46%",
    paddingRight: 8,
  },
  col2: {
    width: "18%",
    textAlign: "right",
  },
  col3: {
    width: "18%",
    textAlign: "right",
  },
  col4: {
    width: "18%",
    textAlign: "right",
  },

  itemTitle: {
    fontSize: 10,
    fontWeight: 600,
  },
  note: {
    fontSize: 8.5,
    color: "#52525b",
    marginTop: 2,
    lineHeight: 1.35,
  },

  totalsWrap: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalBox: {
    width: 220,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    padding: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  totalFinalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d8",
    fontWeight: 700,
  },

  noteBlock: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    padding: 10,
  },
  noteTitle: {
    fontWeight: 700,
    marginBottom: 5,
  },
});

export default function QuotePdfDoc({
  projectName,
  projectAddress,
  quote,
  items,
  logoUrl,
}: {
  projectName: string;
  projectAddress: string;
  quote: Quote;
  items: QuoteItem[];
  logoUrl?: string;
}) {
  const subtotal = items.reduce((s, it) => s + Number(it.amount || 0), 0);
  const gst = subtotal * 0.15;
  const totalIncl = subtotal + gst;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>{logoUrl ? <Image src={logoUrl} style={styles.logo} /> : <View />}</View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Quotation</Text>
            <Text style={styles.subTitle}>RENO-PM</Text>
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.value}>{projectName || "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value}>{projectAddress || "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Recommended</Text>
            <Text style={styles.value}>{money(quote.recommended_total || 0)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={styles.col1}>Item</Text>
            <Text style={styles.col2}>ex GST</Text>
            <Text style={styles.col3}>GST 15%</Text>
            <Text style={styles.col4}>incl GST</Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.bodyRow}>
              <Text style={styles.col1}>No quote items</Text>
              <Text style={styles.col2}>-</Text>
              <Text style={styles.col3}>-</Text>
              <Text style={styles.col4}>-</Text>
            </View>
          ) : (
            items.map((it, idx) => {
              const ex = Number(it.amount || 0);
              const gstValue = ex * 0.15;
              const incl = ex + gstValue;

              return (
                <View key={it.id ?? idx} style={styles.bodyRow}>
                  <View style={styles.col1}>
                    <Text style={styles.itemTitle}>{it.item_name || `Item ${idx + 1}`}</Text>
                    {it.description ? <Text style={styles.note}>{it.description}</Text> : null}
                  </View>
                  <Text style={styles.col2}>{money(ex)}</Text>
                  <Text style={styles.col3}>{money(gstValue)}</Text>
                  <Text style={styles.col4}>{money(incl)}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{money(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>GST 15%</Text>
              <Text>{money(gst)}</Text>
            </View>
            <View style={styles.totalFinalRow}>
              <Text>Total incl GST</Text>
              <Text>{money(totalIncl)}</Text>
            </View>
          </View>
        </View>

        {quote.note ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteTitle}>Note</Text>
            <Text>{quote.note}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}