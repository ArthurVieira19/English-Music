import { describe, expect, it } from "vitest"
import { validateMemberForm, type MemberFormValues } from "./memberForm"

const valid: MemberFormValues = { role: "user", name: "Ana Souza", birthDate: "2001-05-20", email: "ana@example.com", password: "secret1" }
const TODAY = "2026-10-14"

describe("validateMemberForm", () => {
  it("accepts a complete form", () => {
    expect(validateMemberForm(valid, TODAY)).toEqual({})
  })

  it("flags each field on its own", () => {
    const errors = validateMemberForm(
      { role: "user", name: " ", birthDate: "", email: "nope", password: "123" },
      TODAY,
    )
    expect(Object.keys(errors).sort()).toEqual(["birthDate", "email", "name", "password"])
  })

  it("accepts every account type and rejects an unknown one", () => {
    for (const role of ["admin", "teacher", "user"] as const) {
      expect(validateMemberForm({ ...valid, role }, TODAY)).toEqual({})
    }
    expect(validateMemberForm({ ...valid, role: "owner" as never }, TODAY).role).toBeDefined()
  })

  it("rejects impossible, future and ancient birth dates", () => {
    expect(validateMemberForm({ ...valid, birthDate: "2001-02-30" }, TODAY).birthDate).toBeDefined()
    expect(validateMemberForm({ ...valid, birthDate: "2026-10-15" }, TODAY).birthDate).toBeDefined()
    expect(validateMemberForm({ ...valid, birthDate: "1899-12-31" }, TODAY).birthDate).toBeDefined()
    expect(validateMemberForm({ ...valid, birthDate: TODAY }, TODAY).birthDate).toBeUndefined()
  })

  it("trims the name and email before checking", () => {
    expect(validateMemberForm({ ...valid, name: "  Al  ", email: " ana@example.com " }, TODAY)).toEqual({})
  })
})
