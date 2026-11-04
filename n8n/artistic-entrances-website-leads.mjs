import { workflow, node, trigger, sticky, expr } from "@n8n/workflow-sdk";

const ghlCredential = { id: "yS4i5RbMVzLQJ65j", name: "GHL - Artistic Entrances" };

const quoteWebhook = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    name: "Quote Webhook",
    parameters: {
      httpMethod: "POST",
      path: "artistic-entrances-quote",
      authentication: "none",
      responseMode: "responseNode",
    },
  },
  output: [
    {
      json: {
        body: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          phone: "7255550100",
          zip: "89101",
          leadType: "quote",
          doorName: "Door 1",
          doorId: "website-images-1",
          glassName: "Clear",
          glassId: "clear",
          handleName: "Square Pull",
          handleId: "square-pull",
          finishName: "Bronze",
          finishId: "bronze",
          summary: "Door 1, Clear glass",
          serviceArea: "Greater Las Vegas",
          mockupEligible: "yes",
          tags: "website,door-configurator,greater-las-vegas,sms-consent,mockup-eligible",
        },
      },
    },
  ],
});

const normalizeLead = node({
  type: "n8n-nodes-base.set",
  version: 3.4,
  config: {
    name: "Normalize Lead",
    parameters: {
      mode: "manual",
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: "first-name", name: "firstName", value: expr('{{ $json.body?.firstName ?? $json.firstName ?? "" }}'), type: "string" },
          { id: "last-name", name: "lastName", value: expr('{{ $json.body?.lastName ?? $json.lastName ?? "" }}'), type: "string" },
          { id: "email", name: "email", value: expr('{{ $json.body?.email ?? $json.email ?? "" }}'), type: "string" },
          { id: "phone", name: "phone", value: expr('{{ $json.body?.phone ?? $json.phone ?? "" }}'), type: "string" },
          { id: "zip", name: "zip", value: expr('{{ $json.body?.zip ?? $json.zip ?? "" }}'), type: "string" },
          { id: "lead-type", name: "leadType", value: expr('{{ $json.body?.leadType ?? $json.leadType ?? "quote" }}'), type: "string" },
          { id: "door", name: "door", value: expr('{{ [$json.body?.doorName ?? $json.doorName ?? "", $json.body?.doorId ?? $json.doorId ?? ""].filter(Boolean).join(" ") }}'), type: "string" },
          { id: "glass", name: "glass", value: expr('{{ [$json.body?.glassName ?? $json.glassName ?? "", $json.body?.glassId ?? $json.glassId ?? ""].filter(Boolean).join(" ") }}'), type: "string" },
          { id: "handle", name: "handle", value: expr('{{ [$json.body?.handleName ?? $json.handleName ?? "", $json.body?.handleId ?? $json.handleId ?? ""].filter(Boolean).join(" ") }}'), type: "string" },
          { id: "finish", name: "finish", value: expr('{{ [$json.body?.finishName ?? $json.finishName ?? "", $json.body?.finishId ?? $json.finishId ?? ""].filter(Boolean).join(" ") }}'), type: "string" },
          { id: "summary", name: "summary", value: expr('{{ $json.body?.summary ?? $json.summary ?? "" }}'), type: "string" },
          { id: "service-area", name: "serviceArea", value: expr('{{ $json.body?.serviceArea ?? $json.serviceArea ?? "" }}'), type: "string" },
          { id: "mockup", name: "mockupEligible", value: expr('{{ $json.body?.mockupEligible ?? $json.mockupEligible ?? "no" }}'), type: "string" },
          { id: "tags", name: "tags", value: expr('{{ $json.body?.tags ?? $json.tags ?? "" }}'), type: "string" },
          { id: "lock", name: "lock", value: expr('{{ $json.body?.lockName ?? $json.lockName ?? "" }}'), type: "string" },
          { id: "screen", name: "screen", value: expr('{{ $json.body?.screenName ?? $json.screenName ?? "" }}'), type: "string" },
          { id: "sidelights", name: "sidelights", value: expr('{{ $json.body?.sidelightName ?? $json.sidelightName ?? "" }}'), type: "string" },
          { id: "jamb", name: "jamb", value: expr('{{ $json.body?.jambName ?? $json.jambName ?? "" }}'), type: "string" },
          { id: "door-image-url", name: "doorImageUrl", value: expr('{{ $json.body?.doorImageUrl ?? $json.doorImageUrl ?? "" }}'), type: "string" },
        ],
      },
    },
  },
  output: [
    {
      json: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "7255550100",
        zip: "89101",
        leadType: "quote",
        door: "Door 1 website-images-1",
        glass: "Clear clear",
        handle: "Square Pull square-pull",
        finish: "Bronze bronze",
        summary: "Door 1, Clear glass",
        serviceArea: "Greater Las Vegas",
        mockupEligible: "yes",
        tags: "website,door-configurator",
      },
    },
  ],
});

const upsertContact = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Upsert GoHighLevel Contact",
    parameters: {
      method: "POST",
      url: "https://services.leadconnectorhq.com/contacts/upsert",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Version", value: "2021-07-28" }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr('{{ ({ locationId: "uK4q8lpwDpm1J32DZxO4", firstName: $("Normalize Lead").item.json.firstName, lastName: $("Normalize Lead").item.json.lastName, email: $("Normalize Lead").item.json.email, phone: $("Normalize Lead").item.json.phone, postalCode: $("Normalize Lead").item.json.zip, country: "US", source: "website-" + $("Normalize Lead").item.json.leadType, customFields: [ { id: "PK0Ai5QtLvVs6SzBE2A1", field_value: $("Normalize Lead").item.json.door }, { id: "hYPtRh0Yik7MyHOCtxOU", field_value: $("Normalize Lead").item.json.glass }, { id: "0jVumOur6yFOIBsu8K1W", field_value: $("Normalize Lead").item.json.handle }, { id: "dRrt5xOac79sc5ciVQ8l", field_value: $("Normalize Lead").item.json.finish }, { id: "Pz0IOnUAR0GsdYWzxM6n", field_value: $("Normalize Lead").item.json.summary }, { id: "EzMLpWUuTKfGEidVXlSl", field_value: $("Normalize Lead").item.json.serviceArea }, { id: "GvQY0CF4ViOuqhrU3EDg", field_value: $("Normalize Lead").item.json.mockupEligible }, { id: "uMaq7GNRqRehzsaFYQRd", field_value: $("Normalize Lead").item.json.leadType }, { id: "Lrq4JtFkAApDRTYB9DBT", field_value: $("Normalize Lead").item.json.doorImageUrl }, { id: "yP1bPNDkogATKskSh4W4", field_value: $("Normalize Lead").item.json.lock }, { id: "RZB0VEckdMPdYIOWoDc3", field_value: $("Normalize Lead").item.json.screen }, { id: "9IBhVcOH3Em5YsCtPN2z", field_value: $("Normalize Lead").item.json.sidelights }, { id: "6gHTr2PTXQAdrpTIXWfu", field_value: $("Normalize Lead").item.json.jamb } ] }) }}'),
    },
    credentials: { httpHeaderAuth: ghlCredential },
  },
  output: [{ json: { contact: { id: "contact-id" }, new: true } }],
});

const addTags = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Add GoHighLevel Tags",
    parameters: {
      method: "POST",
      url: expr("https://services.leadconnectorhq.com/contacts/{{ $json.contact.id }}/tags"),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Version", value: "2021-07-28" }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr('{{ ({ tags: String($("Normalize Lead").item.json.tags || "").split(",").map(tag => tag.trim()).filter(Boolean) }) }}'),
    },
    credentials: { httpHeaderAuth: ghlCredential },
  },
  output: [{ json: { tags: ["website"] } }],
});

const reply = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    name: "Reply To Website",
    parameters: {
      respondWith: "json",
      responseBody: expr('{{ { ok: true, contactId: $("Upsert GoHighLevel Contact").item.json.contact.id } }}'),
    },
  },
  output: [{ json: { ok: true } }],
});

const restoreImage = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Restore Door Image",
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        'const contactId = $("Upsert GoHighLevel Contact").item.json.contact.id;\nconst source = $("Quote Webhook").item;\nconst doorImage = source.binary && source.binary.doorImage;\nconst item = { json: { contactId, hasDoorImage: Boolean(doorImage) } };\nif (doorImage) item.binary = { doorImage };\nreturn item;',
    },
  },
  output: [{ json: { contactId: "contact-id", hasDoorImage: true } }],
});

const uploadImage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Upload Door Image",
    onError: "continueRegularOutput",
    parameters: {
      method: "POST",
      url: expr(
        'https://services.leadconnectorhq.com/forms/upload-custom-files?contactId={{ $json.contactId }}&locationId=uK4q8lpwDpm1J32DZxO4',
      ),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Version", value: "2021-07-28" }] },
      sendBody: true,
      contentType: "multipart-form-data",
      bodyParameters: {
        parameters: [
          {
            parameterType: "formBinaryData",
            name: expr('{{ "SUkFuAifExggDWD7gUOp_" + $json.contactId }}'),
            inputDataFieldName: "doorImage",
          },
        ],
      },
    },
    credentials: { httpHeaderAuth: ghlCredential },
  },
  output: [{ json: { contact: { id: "contact-id" } } }],
});

const note = sticky(
  "Saves the website quote, catalog, or contact form on the Artistic Entrances GoHighLevel contact. Tags are added in a second call so existing tags are kept. Outside Las Vegas leads are tagged conversational-follow-up. Mockup generation is not in this workflow yet.",
  [quoteWebhook, normalizeLead, upsertContact, addTags, restoreImage, uploadImage, reply],
);

export default workflow("artistic-entrances-website-leads", "Artistic Entrances Website Leads")
  .add(quoteWebhook)
  .to(normalizeLead)
  .to(upsertContact)
  .to(addTags)
  .to(restoreImage)
  .to(uploadImage)
  .to(reply)
  .add(note);
