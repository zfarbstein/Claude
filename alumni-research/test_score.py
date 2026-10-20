"""Checks that the verification rules behave as documented. Uses made-up people.

    python3 -m unittest test_score
"""
import unittest
from unittest import mock

import score
from score import decide

PERSON = {
    "row": 2, "first": "Jonathan", "informal": "Jon", "last": "Sample", "birth_year": 1980,
    "dob": "1980-05-01", "age": 46, "init_year": 1999, "city": "Tampa", "state": "FL", "zip": "33601",
    "email": "jsample@acmelaw.com", "work_email_domain": "acmelaw.com", "phone": "8135550100",
}
URL = "https://example.com/profile"
FACTS = {"title": "Partner", "employer": "Acme Law", "source_url": URL}


def anchor(quote, fetched=True, **extra):
    return {"url": URL, "quote": quote, "fetched": fetched, **extra}


def cand(name="Jon Sample", **anchors):
    return {"name_on_source": name, "facts": FACTS, "anchors": anchors, "sources": [{"url": URL}]}


def status(*cands):
    return decide(PERSON, {"candidates": list(cands)})["status"]


class Rules(unittest.TestCase):
    def setUp(self):
        # Pretend every page was downloaded and contains the quoted text.
        patcher = mock.patch.object(score, "quote_on_page", return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_quote_missing_from_saved_page_does_not_count(self):
        with mock.patch.object(score, "quote_on_page", return_value=False):
            self.assertEqual(status(cand(email_match=anchor("jsample@acmelaw.com"))), "NEEDS REVIEW")

    def test_first_initial_plus_middle_name_accepted(self):
        c = cand(name="J. Robert Sample", uf_education=anchor("UF"), delta_chi=anchor("Delta Chi"))
        self.assertEqual(status(c), "VERIFIED")

    def test_name_alone_is_never_enough(self):
        self.assertEqual(status(cand()), "NEEDS REVIEW")

    def test_uf_alone_is_not_enough(self):
        self.assertEqual(status(cand(uf_education=anchor("B.S., University of Florida"))), "NEEDS REVIEW")

    def test_uf_plus_one_supporting_fact_is_not_enough(self):
        c = cand(uf_education=anchor("University of Florida"),
                 locations=[anchor("Tampa, Florida", city="Tampa", state="Florida")])
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_uf_plus_two_supporting_facts_verifies(self):
        c = cand(uf_education=anchor("University of Florida"),
                 locations=[anchor("Tampa, Florida", city="Tampa", state="Florida")],
                 grad_year=anchor("University of Florida, 2002", year=2002))
        self.assertEqual(status(c), "VERIFIED")

    def test_uf_plus_delta_chi_verifies(self):
        c = cand(uf_education=anchor("University of Florida"), delta_chi=anchor("Delta Chi Fraternity"))
        self.assertEqual(status(c), "VERIFIED")

    def test_roster_email_on_page_verifies(self):
        self.assertEqual(status(cand(email_match=anchor("Contact: JSample@acmelaw.com"))), "VERIFIED")

    def test_email_claim_must_actually_contain_roster_email(self):
        self.assertEqual(status(cand(email_match=anchor("Contact: info@acmelaw.com"))), "NEEDS REVIEW")

    def test_work_email_domain_site_verifies(self):
        c = cand(employer_site={"url": "https://www.acmelaw.com/team", "quote": "Jon Sample, Partner", "fetched": True})
        self.assertEqual(status(c), "VERIFIED")

    def test_other_domain_does_not_count(self):
        c = cand(employer_site={"url": "https://acmelaw.co/team", "quote": "Jon Sample, Partner", "fetched": True})
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_search_summary_quotes_never_verify(self):
        c = cand(uf_education=anchor("University of Florida", fetched=False),
                 delta_chi=anchor("Delta Chi", fetched=False))
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_wrong_last_name_blocks(self):
        c = cand(name="Jon Simple", email_match=anchor("jsample@acmelaw.com"))
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_unknown_first_name_blocks(self):
        c = cand(name="Jason Sample", uf_education=anchor("UF"), delta_chi=anchor("Delta Chi"))
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_legal_name_and_nickname_both_accepted(self):
        for name in ("Jonathan Sample", "Jon Sample", "John Sample", "Jonathan A. Sample Jr."):
            c = cand(name=name, uf_education=anchor("UF"), delta_chi=anchor("Delta Chi"))
            self.assertEqual(status(c), "VERIFIED", name)

    def test_grad_year_contradiction_blocks(self):
        c = cand(uf_education=anchor("UF"), delta_chi=anchor("Delta Chi"), grad_year=anchor("Class of 1975", year=1975))
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_birth_year_contradiction_blocks(self):
        c = cand(email_match=anchor("jsample@acmelaw.com"), birth_year=anchor("born 1950", year=1950))
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_two_plausible_uf_people_is_ambiguous(self):
        good = cand(uf_education=anchor("UF"), delta_chi=anchor("Delta Chi"))
        other = cand(uf_education=anchor("University of Florida", fetched=False))
        self.assertEqual(status(good, other), "NEEDS REVIEW")

    def test_unsourced_job_blocks(self):
        c = cand(email_match=anchor("jsample@acmelaw.com"))
        c["facts"] = {"title": "Partner", "employer": "Acme Law"}
        self.assertEqual(status(c), "NEEDS REVIEW")

    def test_provider_email_match_needs_one_more_fact(self):
        m = anchor("name: Jon Sample", by="email", likelihood=9)
        self.assertEqual(status(cand(lookup_match=m)), "NEEDS REVIEW")
        self.assertEqual(status(cand(lookup_match=m, uf_education=anchor("UF"))), "VERIFIED")

    def test_provider_low_likelihood_does_not_count(self):
        m = anchor("name: Jon Sample", by="email", likelihood=6)
        self.assertEqual(status(cand(lookup_match=m, uf_education=anchor("UF"))), "NEEDS REVIEW")

    def test_provider_name_lookup_is_not_a_lookup_match(self):
        m = anchor("name: Jon Sample", by="name", likelihood=10)
        self.assertEqual(status(cand(lookup_match=m, uf_education=anchor("UF"))), "NEEDS REVIEW")

    def test_nothing_found(self):
        self.assertEqual(status(), "NOT FOUND")


if __name__ == "__main__":
    unittest.main()
