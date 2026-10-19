"""Download pages as plain text so evidence quotes can be checked against them.

    python3 fetch.py URL [URL ...]       # saves data/pages/<id>.txt, prints id + size
    python3 fetch.py --grep "text" URL   # also prints lines containing "text"

score.py only accepts a quote as "fetched" if it really appears in the saved
copy of that page, so a quote can't be misremembered or paraphrased.
"""
import argparse
import hashlib
import re
import subprocess
import sys
from html.parser import HTMLParser

from common import DATA

PAGES = DATA / "pages"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


class Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head"}
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "td"}

    def __init__(self):
        super().__init__()
        self.out, self.skipping, self.links = [], 0, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        if tag in self.SKIP:
            self.skipping += 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skipping:
            self.skipping -= 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skipping:
            self.out.append(data)


def squash(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def page_path(url):
    return PAGES / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")


def page_text(url):
    p = page_path(url)
    return p.read_text() if p.exists() else None


def quote_on_page(url, quote):
    text = page_text(url)
    return text is not None and squash(quote) in squash(text)


def fetch(url):
    r = subprocess.run(
        ["curl", "-sSL", "--compressed", "-m", "30", "-A", UA, "-w", "\n__STATUS__%{http_code}", url],
        capture_output=True, text=True, errors="replace")
    body, _, status = r.stdout.rpartition("\n__STATUS__")
    if status != "200":
        return status or "error", None, []
    t = Text()
    t.feed(body)
    text = "\n".join(line.strip() for line in "".join(t.out).splitlines() if line.strip())
    PAGES.mkdir(parents=True, exist_ok=True)
    page_path(url).write_text(f"URL: {url}\n\n{text}")
    return status, text, t.links


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--grep", action="append", default=[])
    ap.add_argument("--links", help="print links whose URL contains this text")
    args = ap.parse_args()
    for url in args.urls:
        status, text, links = fetch(url)
        print(f"[{status}] {url} {len(text or '')} chars -> {page_path(url).name if text else '-'}")
        for g in args.grep:
            for line in (text or "").splitlines():
                if g.lower() in line.lower():
                    print("    |", line[:300])
        if args.links:
            for link in sorted(set(links)):
                if args.links.lower() in link.lower():
                    print("    ->", link)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
