"""Checks the sheet rules in export.py (PLAN 5.2-5.3). Uses made-up people.

    python3 -m unittest test_export
"""
import datetime as dt
import unittest
from unittest import mock

import export
from common import JOB_COLUMNS

FACTS = {"title": "Partner", "employer": "Acme Law", "industry": "legal services",
         "previous_employers": "Beta LLP", "years_at_company": "since 2022-04", "city": "Tampa",
         "state": "Florida", "linkedin": "linkedin.com/in/jon-sample", "as_of": "2026-09-01"}
ROW = {**dict.fromkeys(JOB_COLUMNS, ""), "Research Status": "Not Started"}


@mock.patch.object(export, "TODAY", dt.date(2026, 10, 20))
class ExportTest(unittest.TestCase):
    def test_team_formats(self):
        v = export.team_values(FACTS)
        self.assertEqual(v["Years at Current Company"], "4")
        self.assertEqual(v["LinkedIn Profile"], "https://www.linkedin.com/in/jon-sample")
        self.assertEqual(v["Industry/Field"], "Legal Services")
        self.assertEqual(v["State"], "Florida")

    def test_outdated(self):
        self.assertFalse(export.outdated(FACTS))
        self.assertTrue(export.outdated({**FACTS, "as_of": "2023-01-15"}))
        self.assertTrue(export.outdated({**FACTS, "years_at_company": ""}))
        self.assertFalse(export.outdated({"title": "", "employer": ""}))

    def test_promotable(self):
        verified = {"status": "VERIFIED"}
        self.assertTrue(export.promotable(ROW, verified, FACTS))
        self.assertFalse(export.promotable(ROW, {"status": "NEEDS REVIEW"}, FACTS))
        self.assertFalse(export.promotable({**ROW, "Current City": "Tampa"}, verified, FACTS))
        self.assertFalse(export.promotable({**ROW, "Research Status": "Unable to Find"}, verified, FACTS))
        self.assertTrue(export.promotable({**ROW, "Research Status": ""}, verified, FACTS))
        self.assertFalse(export.promotable(ROW, verified, {**FACTS, "as_of": "2020-01-01"}))


if __name__ == "__main__":
    unittest.main()
