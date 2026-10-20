"""Checks the degree/seniority rules with a tiny made-up O*NET table (no download).

    python3 -m unittest test_careers
"""
import unittest

import careers
from careers import classify


class Careers(unittest.TestCase):
    def setUp(self):
        self.saved = careers._TITLES
        careers._TITLES = {"software engineer": {4}, "engineer": {4}, "bartender": {2},
                           "real estate agent": {3}, "support analyst": {3}, "store manager": {3},
                           "attorney": {5}, "president": {5}}

    def tearDown(self):
        careers._TITLES = self.saved

    def test_degree_job(self):
        self.assertTrue(classify("Senior Software Engineer")["degree"])

    def test_no_degree_job_is_skipped(self):
        self.assertIs(classify("Bartender")["degree"], False)
        self.assertIs(classify("Real Estate Agent")["degree"], False)

    def test_partial_match_is_unclear_not_skipped(self):
        self.assertIsNone(classify("Senior Sales / Business Operations & Support Analyst")["degree"])

    def test_manager_level_is_never_skipped(self):
        self.assertIsNone(classify("Store Manager")["degree"])

    def test_unknown_title_is_unclear(self):
        self.assertIsNone(classify("Manager, Implementation")["degree"])

    def test_director_and_up_count_as_degree(self):
        self.assertTrue(classify("Director of Camp Programs")["degree"])

    def test_seniority_levels(self):
        self.assertEqual(classify("Executive Vice President")["level"], 4)
        self.assertEqual(classify("Managing Partner")["level"], 5)
        self.assertEqual(classify("Director, Partner Success")["level"], 3)
        self.assertEqual(classify("Business Partner")["level"], 0)
        self.assertEqual(classify("Principal Engineer")["level"], 1)
