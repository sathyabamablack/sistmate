# Sathyabama grading, credits and CGPA

How Sathyabama Institute of Science and Technology (Chennai) grades courses and computes GPA/CGPA, and how this app turns the marks shown in the ERP into grades. All facts come from the institute's own PDFs. Every source was accessed on **12 October 2026** and is listed at the end.

The data the app uses is in [`packages/core/src/sathyabama-catalog.json`](../packages/core/src/sathyabama-catalog.json). It holds the regulations, mark schemes, fallback rules and 780 course entries.

> The official grade sheet issued by the Controller of Examinations is always authoritative. The app's numbers are an estimate built from published rules.

---

## 1. Which regulation am I on?

| Regulation | Admitted | Code pattern | Examples |
|---|---|---|---|
| **2019** | From 2019-20 until Regulations 2023 took over in 2023-24 (the end year is inferred). Also covers the CSE specialisation curricula published in 2021 under the 2019 regulations | `A` after the programme code | SCSA1201, SMTA1101, SECA1404, SPHA2101, S11APT1 |
| **2023** | 2023-24 onwards | `B` after the programme code | SCSB1303, SMTB1302, SISB4301, S12BLH31, S13BLH21, SCSBOB1301 |

The 2023 course-code format comes from Regulations 2023, cl. 5.5 (a figure on PDF p.14):

```
S  <programme>  B  [LH|PB]  <semester> <sequence>
```

- The programme part is two letters (CS, IT, MT maths, PH physics, CY chemistry, HS English, and so on).
- It is numeric when the course has a practical or project component (CS = 11, IT = 12, ...).
- `LH` marks a practical-heavy theory course. `PB` marks a project-based learning course.

**The grade bands and pass rules are the same in both regulations.** The differences are in how internal marks are built up and in the course types.

## 2. Grade table (both regulations)

Regulations 2023 cl. 24 (PDF p.35) and Regulations 2019 cl. 16 (UG doc PDF p.23; CSE 2019 syllabus PDF p.8) say:

> Letter grades are "awarded as per the range of total marks (out of 100) obtained by the candidate in each course".

| Total (out of 100) | Grade | Grade points |
|---|---|---|
| 90-100 | **A++** | 10 |
| 80-89 | **A+** | 9 |
| 70-79 | **B++** | 8 |
| 60-69 | **B+** | 7 |
| 50-59 | **C** | 6 |
| 0-49 | **RA** (reappear) | 0 |
| Absent | **AAA** | 0 |
| Withdrawal | **W** | 0 |
| Authorised break of study | **ABS** | 0 |

Sathyabama UG does **not** use S/A/B/O letters. A table with "S / A+ / A / B / C / F" found online belongs to an older, pre-2019 PG scheme and is not used here.

## 3. Pass rules (both regulations)

Regulations 2023 cl. 22.1 (PDF p.32-33) and Regulations 2019 cl. 15 (UG doc p.22; CSE syllabus p.7) both say:

> "not less than 50% of total marks prescribed for the courses, subject to securing a minimum of 30% marks out of maximum mark in end semester exams."

What that means in practice:

- **Total:** at least 50% of the course maximum. That is 50/100 for most courses and 25/50 for a 1-credit lab.
- **End-semester exam (ESE):** at least 30% of the ESE maximum.
  - Theory ESE is written for 100 and converted to 50, so you need 30/100 raw, or 15/50 converted.
  - A practical ESE is out of 50, so you need 15.
  - 30% of a 25-mark lab ESE is 7.5. This is our inference; the PDFs do not give that number.
- **Arrears:** you rewrite the ESE until you pass, with no limit on attempts (2023 cl. 8.2). Your continuous-assessment marks from the first attempt are kept for every later attempt (both regulations).
- **Mandatory Audit Courses (2023):** you need 80% attendance and 50% in the LMS assignments to get a PASS. There is no ESE and no credit (cl. 22.3, PDF p.34).

## 4. Mark schemes by course type

Every credit-bearing course is split 50% internal and 50% external, except Professional Training and Skill Enhancement, which are 100% external. The sources are:

- 2023: cl. 20.1-20.3. The component and evaluation tables are images on PDF pp.30-31.
- 2019: cl. 10 in the CSE syllabus and cl. 14 in the UG regulations.

| Type | Internal (CAE) | External (ESE) | Max | Notes |
|---|---|---|---|---|
| **Theory** | 50 | 50 | 100 | 2023: two CAEs out of 100 converted to 40, plus assignment 10. 2019: same, but the extra 10 is "assignment" in the UG regulations and "attendance %" in later CSE editions; the earliest CSE 2019 edition uses CAE 45 + attendance 5. The total is 50 in every version. |
| **Practical (2-credit lab, L-T-P 0-0-4)** | 50 | 50 | 100 | 2023: session assessment 30 + model exam 20. 2019: continuous 25 + model 20 + attendance 5. |
| **Practical (1-credit lab, 0-0-2)** | 25 | 25 | **50** | Physics Lab, Chemistry Lab, Code Optimization and Debugging, Business Communication Lab. This matches the "labs are out of 50" observation. Five 2019 one-credit labs are 50 + 50 = 100 (SCSA2305, SCSA2401, SCSA2406, SCSA2407, SITA2301), so always check the catalog. |
| **Integrated: practical-heavy (`LH`, 2023)** | 50 (theory CAE + assignment) | 50 (end-semester **practical** exam) | 100 | Usually 4 credits. Examples: S12BLH31 Programming in Java, S13BLH21 Digital Logic Circuits. |
| **Integrated: theory with project-based learning (`PB`, or "Theory+Project", 2023)** | 50 | 50 (project review / report) | 100 | 3 credits. Examples: SISB4301 Universal Human Values, S11BPB51. |
| **Project Phase I / II** | 50 (3 reviews) | 50 (viva voce) | 100 | Phase I is 3 credits and Phase II is 7 (M.E. Phase II is 15). |
| **Professional Training / Internship / Interdisciplinary Project (2023)** | 0 | 100 | 100 | 2 credits (PT I) or 3 credits (PT II and the alternatives). In 2019 the PDFs show 50/50. |
| **Skill Enhancement (2023)** | 0 | 100 | 100 | 1 credit each in semesters 4, 5 and 6. |
| **Mandatory Audit (2023 SISB4151-4155) / EVS (2019 SBTA1101)** | 50 | none | 50 | **0 credits, PASS/FAIL, never in GPA.** Some PDFs print other marks (annexure headers say "Total Marks 100"; some 2019 editions show 50/50 for EVS); this does not matter for GPA. |

## 5. GPA and CGPA

Regulations 2023 cl. 24 (PDF p.35) and Regulations 2019 cl. 16:

```
GPA  = Σ (Ci × GPi) / Σ Ci      over courses successfully cleared in the semester
CGPA = Σ (Ci × GPi) / Σ Ci      over courses successfully cleared in all semesters
```

Here Ci is the course's credits and GPi is the grade point.

- **RA, AAA, W and ABS are excluded from both the top and the bottom of the formula.** A failed course does not lower your GPA; it simply does not count until you clear it. Once cleared, it counts with the grade you earned.
- The regulations do not cap the grade of a re-attempt.
- The regulations do not say which semester's GPA a later pass belongs to. The app counts it in CGPA once.
- Non-credit courses (C = 0) never affect GPA.

**Degree classes** (both regulations):

| CGPA | Class | Condition |
|---|---|---|
| ≥ 9.0 | First Class with Exemplary | All courses passed at first attempt within 8 semesters |
| ≥ 7.5 | First Class with Distinction | All courses passed at first attempt within 8 semesters |
| ≥ 6.0 | First Class | All courses passed within 8 semesters |
| ≥ 5.0 | Second Class | All courses passed within 12 semesters |

The minimum CGPA for the degree is 5.0.

### Worked example: the real semester-3 capture (Regulations 2023)

| Code | Course | Credits | Type |
|---|---|---|---|
| SMTB1302 | Discrete Mathematics and Numerical Methods | 3 | theory |
| SCSB1303 | Theory of Computation | 3 | theory |
| SCSBOB1301 | Computer Architecture and Organization | 3 | theory |
| SISB4301 | Universal Human Values | 3 | integrated (Theory+Project) |
| S13BLH21 | Digital Logic Circuits | 4 | integrated (practical-heavy) |
| S12BLH31 | Programming in Java | 4 | integrated (practical-heavy) |
| | **Total** | **20** | |

Suppose (illustration only) the grades are A++, A+, A+, A++, B++ and A+. The GPA is:

```
(3×10 + 3×9 + 3×9 + 3×10 + 4×8 + 4×9) / 20 = 182 / 20 = 9.10
```

The ERP labels SISB4301, S13BLH21 and S12BLH31 as **"Practical"**, even though the curriculum calls them Theory+Project and Theory+Practical worth 3, 4 and 4 credits. If the app took "Practical" to mean a 2-credit lab, this semester's weights would come out wrong.

## 6. How the app maps ERP marks to a grade

1. **Look up the course code** in `courses`. If it is there, use that entry's `credits`, `maxTotal`, `internalMax` and `externalMax`. If not, apply the fallback rules (section 7) and label the result as an estimate.
2. **Normalise:** `percent = total / maxTotal × 100`. For example, a 1-credit lab with 44/50 is 88%, which is A+. The grade bands are defined on marks out of 100, so a 50-mark course must be scaled first. The regulations do not describe this scaling. It is our assumption, and it is the only reading under which a 50-mark lab can earn A++.
3. **Pass check:**
   - `percent ≥ 50`, and
   - the external mark is at least 30% of `externalMax`, using the same scale the ERP reports. If the ERP shows the raw theory ESE out of 100, the bar is 30/100; if it shows the converted mark out of 50, the bar is 15/50.
   - If either check fails, the grade is RA with 0 points, and the course is left out of GPA until it is cleared.
   - When the ERP sends its own Pass/Fail for the paper (the live ERP always does), that result decides and the check above is only used when it is missing. If the ERP says Pass but the percentage is under 50, the course maximum must be wrong, so the app gives the lowest pass grade (C). This is an implementation choice, not a rule from the regulations.
4. **Band:** take the highest band whose `min` is at most the percent. The bands are written as whole numbers (80-89, 90-100). For fractional totals, such as 89.5, we do not round up, so 89.5 is A+. This is an assumption.
5. **Weight** the grade points by `credits`. Courses with 0 credits are skipped.

## 7. Fallback for courses not in the catalog

All of these are estimates, and the UI should let the student edit them. They are the `fallback.rules` in the JSON.

- **Regulation:** an `A` after the programme code means 2019 and a `B` means 2023. Grading is the same either way.
- **`LH` in the code (2023):** integrated, 4 credits. 37 of the 38 LH codes in the catalog are 4 credits; S613LH71 is really a lab.
- **`PB` in the code:** integrated with project-based learning, 3 credits.
- **`PROJ1` / `PROJ2` / `PT1` / `PT2` / `IPROJ` / `CPROJ`:** Project Phase I (3 credits) or Phase II (7), Professional Training I (2), or PT II and its alternatives (3).
- **Four-digit numeric part** (observed pattern, not a documented rule):
  - 1xxx = core theory, 3 credits
  - 2xxx = lab: 2 credits if the course max is 100, 1 credit if it is 50
  - 3xxx = professional elective, 3 credits
  - 4xxx = open elective or humanities, 3 credits. Exceptions: SISB415x are 0-credit audit courses, and SISB4301 is a 3-credit Theory+Project.
  - M.E. codes: 5xxx theory, 6xxx lab, 7xxx elective.
- **ERP `SubjectType`:** THEORY means 3 credits. **Practical is ambiguous:** apply the code rules above first. Only treat a course as a lab when no other marker applies.
- **Default credits when nothing else matches:** theory 3, practical 2 (1 if the max is 50), integrated 4, project 3, skill enhancement 1, audit 0.

These defaults match the data closely: 548 of the 555 catalogued theory courses are 3 credits. The exceptions are all 2019 courses: Industry 4.0 (2), SCSA1314, SCSA1315 and SCSA1414 (2 each), and SCYA1101 and SPHA1101 in the earliest CSE 2019 edition (4 each).

## 8. Catalog coverage

780 course codes in total: 379 under the 2023 regulations and 401 under 2019.

Each code is listed once, under its first source, with every programme it appears in. A shared course is therefore counted under several programmes, and the per-programme counts below add up to more than 780.

- **2023 curricula** (L-T-P-EL-C and CAE/ESE columns):
  - B.E. CSE: 181 codes
  - B.Tech IT: 178
  - CSE (Cyber Security): 154
  - CSE (CS & Business Systems): 153
  - CSE (AI): 151
  - CSE (Data Science): 151
  - CSE (AI & Robotics): 152
  - CSE (Blockchain): 150
  - The 2023 MAC / Open Elective / Skill Enhancement annexure
  - The 2025 Board of Studies revisions: SCSB1202, SCSB2602, SCSB3040, S732BLH62 and SMTB1603
- **2019 curricula:**
  - B.E. CSE, current sist edition: 118 codes
  - B.E. CSE, earlier sathyabama.ac.in edition: 102
  - B.Tech IT: 119
  - CSE specialisations: AI 113, AI & ML 114, AI & Robotics 115, Blockchain 115, Cyber Security 106, Data Science 115, IoT 114
  - M.E. CSE: 41
- **The six real-capture codes** are all covered with official credits: SISB4301 (3), S13BLH21 (4), SMTB1302 (3), SCSB1303 (3), S12BLH31 (4) and SCSBOB1301 (3).
- **Mock codes:** SCSA5101 to SCSA5105 are real M.E. CSE (2019) codes, but with different titles from the mock data (for example, SCSA5101 is "Advanced Data Structures and Algorithms"). SCSA5106 and SMAT5101 are not real codes and are not in the catalog.

How the catalog was checked:

- Each curriculum was parsed and the coded rows were summed per semester, then compared with the PDF's own "Total Credits for semester N" line.
  - 2023: semesters 1-3 match exactly in every parsed curriculum. Later semesters match once the uncoded elective, open-elective and skill rows are added; this was checked by hand for B.E. CSE and Cyber Security.
  - 2019: every semester matches in the CSE, AI, AI & ML, AI & Robotics, Cyber Security and IoT curricula. The two exceptions are the Blockchain typo listed below and a malformed elective row in Data Science.
- Codes appearing in several programmes were cross-checked against each other. The only real disagreement is SBMB4001: the annexure header prints 0 credits, while every curriculum says 3.

## 9. Confirmed vs assumed

| Item | Status |
|---|---|
| Grade bands, grade points, RA/AAA/W/ABS excluded from GPA, credit-weighted GPA/CGPA, degree classes | **Confirmed** (2019 and 2023 regulation text) |
| 50% total plus 30% ESE minimum | **Confirmed** (both regulations) |
| Theory, lab and project internal/external splits; 2023 practical-heavy and PBLA splits | **Confirmed** (regulation text, and the image tables on 2023 PDF pp.30-31) |
| 1-credit labs out of 50 (25 + 25) | **Confirmed** per course from the curriculum columns and syllabus headers; not universal in 2019 |
| Credits and L-T-P for the 780 catalogued codes | **Confirmed**: copied from curriculum tables, none derived |
| Scaling a 50-mark course to a percentage before banding | **Assumed** (the regulations only say "out of 100") |
| No rounding up at band edges (89.5 is A+) | **Assumed** |
| A total of 50 or more with ESE below 30% is graded RA | **Inferred** (the result is a fail, but the grade letter is not named) |
| 30% of a 25-mark ESE (7.5) for 1-credit labs | **Inferred** |
| Skill Enhancement Courses graded on the same bands | **Assumed** |
| Fallback credits and category digits for unknown codes | **Heuristic** |

**Conflicts between sources:**

- **2019 internal split.** The earliest CSE 2019 edition uses CAE 45 + attendance 5. The UG Academic Regulations 2019 use 40 + assignment 10. The 2021 specialisation editions and M.E. use 40 + attendance 10. All three total 50 internal.
- **2019 practical internal.** The CSE editions use 25 + 20 + 5. The UG regulations table shows Record 30 + Model 20. Both total 50.
- **SISB4301 EL hours.** The B.E. CSE PDF gives 3 external-learning hours; the Cyber Security and CSBS PDFs give 0. Credits are 3 in all of them.
- **Two 2019 CSE editions.** The earlier edition (165 credits) and the current sist edition (168 credits) differ in a few codes, for example SHSA1101 vs SHSA1105 and SCYA1101 (4 credits) vs SCYA1102 (3 credits). Both are kept.
- **Elective codes.** The earlier edition's curriculum table lists Advanced Data Structures as SCSA1304, but its syllabus page says SCSA1305. SITA1501 and SITA1502 are also numbered differently between editions. When in doubt, trust the code the ERP shows.
- **PDF typos.** The CSE-AI 2023 PDF prints SMBT1402 (meant to be SMTB1402); it was dropped. S613LH71 is coded as LH but is a 0-0-4 lab. The CSE-Blockchain 2019 PDF states 23 credits for semester 5, but its rows add up to 24.

## 10. Gaps

- The 2023 CSE (AI & ML) and CSE (IoT) curricula are scanned images, and no OCR tool was available. Their programme-specific codes are missing, except the two IoT revision courses. Courses shared with plain CSE are covered.
- Semester numbers are per programme. 2019 B.Tech IT rows have no semester, because that PDF's semester headings could not be parsed reliably.
- Open-elective titles in the 2019 lists vary slightly between PDFs (for example SBMA4006). Credits are the same in every PDF.
- Elective, open-elective and skill slots in the curricula have no code. The student's actual elective is only in the catalog if it appears in one of the elective lists that were parsed.
- Non-CSE programmes (ECE, Mech, etc.) were not catalogued. Their shared first-year codes (maths, physics, chemistry, English, drawing) are covered through the CSE and IT curricula.

## Sources (all accessed 2026-10-12)

**Regulations**

- Academic Regulations 2023, B.E./B.Tech & M.E./M.Tech: https://sist.sathyabama.ac.in/syllabus2023/soc/becse-r2023regulation.pdf. The file is byte-identical to https://sist.sathyabama.ac.in/syllabus2023/sobe/becivil-r2023regulation.pdf.
  - Credit rules: cl. 5.4 (PDF p.13)
  - Course code format: cl. 5.5 (p.14)
  - Arrears: cl. 8.2 (p.16)
  - Assessment: cl. 20 (pp.27-31)
  - Passing: cl. 22.1 (pp.32-33)
  - Audit courses: cl. 22.3 (pp.33-34)
  - Grades and CGPA: cl. 24 (p.35)
- Academic Regulations 2019, UG B.E./B.Tech: https://www.sathyabama.ac.in/sites/default/files/2023-04/ACADEMIC%20REGULATION%20UG%20B.E.B.TECH_.pdf
  - Credit allocation: cl. 10.1 (p.12)
  - Assessment: cl. 14 (pp.16-21)
  - Passing: cl. 15 (p.22)
  - Grades and CGPA: cl. 16 (p.23)
- B.E. CSE 2019 syllabus with regulations, earlier edition: https://www.sathyabama.ac.in/sites/default/files/2021-02/B.E.%20CSE%202019%20syllabus.pdf
  - Internal marks: cl. 10 (p.5)
  - Passing: cl. 13 (p.7)
  - Grades: cl. 14 (p.8)
  - Non-credit courses: cl. 21 (p.12)
- B.E. CSE (Cyber Security) 2019 curriculum with regulations: https://sist.sathyabama.ac.in/syllabus2019/soc/becse-cybersecuritycurriculum.pdf (pp.5-8)
- M.E. CSE 2019 regulations: https://sist.sathyabama.ac.in/syllabus2019/soc/mecseregulation.pdf (pp.6-7)

**2023 curricula**

- B.E. CSE: https://sist.sathyabama.ac.in/syllabus2023/soc/becse-r2023curriculum.pdf
- B.Tech IT: https://sist.sathyabama.ac.in/syllabus2023/soc/btechit-r2023curriculum.pdf
- CSE (Cyber Security): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-cybersecurity-r2023curriculum.pdf
- CSE (CS & Business Systems): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-csbs-r2023curriculum.pdf
- CSE (AI): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-ai-r2023curriculum.pdf
- CSE (Data Science): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-ds-r2023curriculum.pdf
- CSE (AI & Robotics): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-airobotics-r2023curriculum.pdf
- CSE (Blockchain): https://sist.sathyabama.ac.in/syllabus2023/soc/becse-blockchain-r2023curriculum.pdf
- CSE (AI & ML) and CSE (IoT), image-only: https://sist.sathyabama.ac.in/syllabus2023/soc/becse-aiml-r2023curriculum.pdf and https://sist.sathyabama.ac.in/syllabus2023/soc/becse-iot-r2023curriculum.pdf
- MAC / Open Elective / Skill Enhancement annexure: https://sist.sathyabama.ac.in/syllabus2023/maccourses/mac_oe_sec.pdf
- Evaluation annexures: https://sist.sathyabama.ac.in/syllabus2023/annexures/annexures.pdf
- 2025 revisions: https://sist.sathyabama.ac.in/syllabus2023/revision/5_1_29122025.pdf and https://sist.sathyabama.ac.in/syllabus2023/revision/6_1_29122025.pdf
- Index page: https://sist.sathyabama.ac.in/syllabus2023/schoolWiseSyllabus.php?id=1&school=COMPUTING&shortname=soc&regularpt=regular

**2019 curricula**

- B.E. CSE: https://sist.sathyabama.ac.in/syllabus2019/soc/becsecurriculum.pdf
- B.Tech IT: https://sist.sathyabama.ac.in/syllabus2019/soc/btechitcurriculum.pdf
- CSE specialisations: https://sist.sathyabama.ac.in/syllabus2019/soc/becse-aicurriculum.pdf, -aimlcurriculum.pdf, -airoboticscurriculum.pdf, -blockchaincurriculum.pdf, -cybersecuritycurriculum.pdf, -dscurriculum.pdf, -iotcurriculum.pdf
- M.E. CSE: https://sist.sathyabama.ac.in/syllabus2019/soc/mecsecurriculum.pdf

No secondary sources were used for any value in the catalog. Third-party aggregators such as Scholaro, Scribd and College Sidekick turned up in searches but were not relied on.
