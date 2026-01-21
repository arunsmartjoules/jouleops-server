import supabase from "./src/config/supabase.js";
import complaintsService from "./src/services/complaintsService.js";
import complaintsController from "./src/controllers/complaintsController.js";

async function verify() {
  console.log("--- Verifying Complaint Lookup ---");
  // Get a random complaint to test lookup
  const { data: complaints } = await supabase
    .from("complaints")
    .select("ticket_id, ticket_no, id")
    .limit(1);
  if (complaints && complaints.length > 0) {
    const c = complaints[0];
    console.log("Sample complaint:", c);
    // Use id for lookup since ticket_id is null
    const byId = await complaintsService.getComplaintById(c.id);
    const byTicketNo = await complaintsService.getComplaintById(c.ticket_no);

    console.log("Lookup by id (UUID):", byId ? "SUCCESS" : "FAILED");
    console.log("Lookup by ticket_no:", byTicketNo ? "SUCCESS" : "FAILED");
  }

  console.log("\n--- Verifying Status Transition Rules ---");
  // Get an existing Open ticket to test
  const { data: openTickets } = await supabase
    .from("complaints")
    .select("*")
    .eq("status", "Open")
    .limit(1);

  if (openTickets && openTickets.length > 0) {
    const ticket = openTickets[0];
    console.log(
      "Testing on Open ticket:",
      ticket.ticket_no,
      "(id:",
      ticket.id + ")",
    );

    // Test: Open -> Resolved (should FAIL - not from Inprogress)
    const req1 = {
      params: { ticketId: ticket.id }, // Use id instead of ticket_id
      body: { status: "Resolved", remarks: "Fixed it" },
      user: { name: "Tester", email: "test@example.com" },
    };
    const res1 = {
      status: (c) => {
        res1.code = c;
        return res1;
      },
      json: (d) => {
        res1.data = d;
      },
    };
    await complaintsController.updateStatus(req1, res1);
    console.log(
      "Open -> Resolved:",
      res1.code === 400
        ? "✅ CORRECTLY BLOCKED"
        : "❌ UNEXPECTED: " + res1.code,
      res1.data?.error || "",
    );

    // Test: Open -> Cancelled without remarks (should FAIL)
    const req2 = {
      params: { ticketId: ticket.id }, // Use id instead of ticket_id
      body: { status: "Cancelled", remarks: "" },
      user: { name: "Tester", email: "test@example.com" },
    };
    const res2 = {
      status: (c) => {
        res2.code = c;
        return res2;
      },
      json: (d) => {
        res2.data = d;
      },
    };
    await complaintsController.updateStatus(req2, res2);
    console.log(
      "Open -> Cancelled (no remarks):",
      res2.code === 400
        ? "✅ CORRECTLY BLOCKED"
        : "❌ UNEXPECTED: " + res2.code,
      res2.data?.error || "",
    );
  } else {
    console.log("No Open tickets found to test.");
  }

  // Get an Inprogress ticket to test Resolved transition
  const { data: inProgressTickets } = await supabase
    .from("complaints")
    .select("*")
    .eq("status", "Inprogress")
    .limit(1);

  if (inProgressTickets && inProgressTickets.length > 0) {
    const ticket = inProgressTickets[0];
    console.log(
      "\nTesting on Inprogress ticket:",
      ticket.ticket_no,
      "(id:",
      ticket.id + ")",
    );

    // Test: Inprogress -> Resolved without remarks (should FAIL)
    const req3 = {
      params: { ticketId: ticket.id }, // Use id instead of ticket_id
      body: { status: "Resolved", remarks: "" },
      user: { name: "Tester", email: "test@example.com" },
    };
    const res3 = {
      status: (c) => {
        res3.code = c;
        return res3;
      },
      json: (d) => {
        res3.data = d;
      },
    };
    await complaintsController.updateStatus(req3, res3);
    console.log(
      "Inprogress -> Resolved (no remarks):",
      res3.code === 400
        ? "✅ CORRECTLY BLOCKED"
        : "❌ UNEXPECTED: " + res3.code,
      res3.data?.error || "",
    );
  } else {
    console.log("No Inprogress tickets found to test.");
  }

  console.log("\n--- Verification Complete ---");
}

verify();
