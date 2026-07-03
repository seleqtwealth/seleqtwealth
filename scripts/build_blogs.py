#!/usr/bin/env python3
"""
Local one-time generator: converts the 15 SELEQT blog drafts (docx) into
finished house-format blog pages under blogs/, and writes scripts/schedule.json
(the weekly drip queue used by publish_next.py in CI).

Run locally:  python3 scripts/build_blogs.py
It reads the docx from DRAFTS_DIR (not committed); the generated HTML + the
schedule.json ARE committed, so the GitHub Action never needs the drafts.
"""
import zipfile, re, html, io, os, json, datetime

DRAFTS_DIR = "/Users/adityab/Downloads/seleqt blogs"
OUT_DIR = "blogs"
FIRST_WED = datetime.date(2026, 7, 8)   # next Wednesday from build day

# file -> canonical slug (slugs taken from the cross-link web so links resolve)
SLUG = {
  "SELEQT_Blog_01_Gold 1.docx": "gold-etf-vs-physical-gold",
  "Blog_02_Rupee.docx":         "falling-rupee-investment-returns",
  "Blog_03_ForeignCapital.docx":"india-attracting-foreign-capital",
  "Blog_04_GiftCity.docx":      "investing-in-india-gift-city",
  "Blog_05_NRImoney.docx":      "nri-repatriation-money-out-of-india",
  "Blog_06_CapitalGains.docx":  "new-capital-gains-rules-one-year-on",
  "Blog_07_DebtFunds.docx":     "debt-mutual-funds-after-indexation",
  "Blog_08_USstocks.docx":      "tax-on-us-stocks-foreign-etfs",
  "Blog_09_Will.docx":          "why-a-will-is-not-enough",
  "Blog_10_Trusts.docx":        "private-family-trusts-india",
  "Blog_11_LifeInsurance.docx": "how-much-life-insurance-you-need",
  "Blog_12_HealthCover.docx":   "family-health-insurance-2026",
  "Blog_13_Conservative.docx":  "building-conservative-portfolio",
  "Blog_14_Yield.docx":         "higher-yield-is-not-higher-return",
  "Blog_15_SIP.docx":           "sip-in-a-flat-market",
}
ORDER = ["SELEQT_Blog_01_Gold 1.docx","Blog_02_Rupee.docx","Blog_03_ForeignCapital.docx",
  "Blog_04_GiftCity.docx","Blog_05_NRImoney.docx","Blog_06_CapitalGains.docx",
  "Blog_07_DebtFunds.docx","Blog_08_USstocks.docx","Blog_09_Will.docx","Blog_10_Trusts.docx",
  "Blog_11_LifeInsurance.docx","Blog_12_HealthCover.docx","Blog_13_Conservative.docx",
  "Blog_14_Yield.docx","Blog_15_SIP.docx"]
CATEGORY = {
  "SELEQT_Blog_01_Gold 1.docx":"Investments","Blog_02_Rupee.docx":"Investments",
  "Blog_03_ForeignCapital.docx":"Investments","Blog_04_GiftCity.docx":"Investments",
  "Blog_05_NRImoney.docx":"Taxation","Blog_06_CapitalGains.docx":"Taxation",
  "Blog_07_DebtFunds.docx":"Investments","Blog_08_USstocks.docx":"Taxation",
  "Blog_09_Will.docx":"Succession","Blog_10_Trusts.docx":"Succession",
  "Blog_11_LifeInsurance.docx":"Insurance","Blog_12_HealthCover.docx":"Insurance",
  "Blog_13_Conservative.docx":"Investments","Blog_14_Yield.docx":"Investments",
  "Blog_15_SIP.docx":"Investments",
}
DISCLAIMER = {
 "Investments":"Investments in securities markets are subject to market risks. Read all related documents carefully before investing. Past performance is not indicative of future results. All material conflicts of interest are disclosed in writing prior to engagement.",
 "Taxation":"Tax outcomes depend on individual circumstances and prevailing law, which is subject to change. This article is general information, not tax advice. All material conflicts of interest are disclosed in writing prior to engagement.",
 "Insurance":"Insurance products are subject to terms, conditions, and exclusions. Please read the policy documents carefully before purchasing. All material conflicts of interest are disclosed in writing prior to engagement.",
 "Succession":"Succession and estate planning involves legal considerations; we work in coordination with qualified legal professionals. All material conflicts of interest are disclosed in writing prior to engagement.",
}

def dedash(s):
    s = s.replace("—"," ,").replace("–",", ")
    s = re.sub(r"\s+,\s+", ", ", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s

def maplink(url):
    """draft URL -> live site URL"""
    u = url.strip()
    if "seleqt.in/contact" in u: return "/#contact"
    m = re.search(r"seleqt\.in/blog/([a-z0-9-]+)", u)
    if m: return "/blogs/" + m.group(1)
    m = re.search(r"seleqt\.in/(taxation|investments|insurance|succession|about|blogs?)\b", u)
    if m:
        p = m.group(1); p = "blogs" if p=="blog" else p
        return "/" + p
    return u  # external

def esc(t): return t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def para_html(runs):
    """runs: list of ('text'|'bold'|('link',url), text). returns inner html."""
    out=[]
    for kind, txt, url in runs:
        t = esc(dedash(txt))
        if kind=="link":
            href = maplink(url)
            if href.startswith("http"):
                out.append(f'<a href="{href}" target="_blank" rel="noopener">{t}</a>')
            else:
                out.append(f'<a href="{href}">{t}</a>')
        elif kind=="bold":
            out.append(f"<strong>{t}</strong>")
        else:
            out.append(t)
    return "".join(out).strip()

def parse(path):
    z=zipfile.ZipFile(path); rels={}
    try:
        rx=z.read('word/_rels/document.xml.rels').decode('utf-8')
        for m in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"',rx): rels[m.group(1)]=m.group(2)
    except KeyError: pass
    d=z.read('word/document.xml').decode('utf-8')
    paras=[]
    for p in re.findall(r'<w:p[ >].*?</w:p>',p_all:=d,re.S) if False else re.findall(r'<w:p[ >].*?</w:p>',d,re.S):
        runs=[]; allbold=True; anytext=False; haslink=False
        for tok in re.finditer(r'(<w:hyperlink[^>]*r:id="([^"]+)"[^>]*>.*?</w:hyperlink>)|(<w:r[ >].*?</w:r>)',p,re.S):
            if tok.group(1):
                u=rels.get(tok.group(2),''); inner=''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>',tok.group(1),re.S))
                if inner: runs.append(("link",html.unescape(inner),u)); anytext=True; haslink=True; allbold=False
            else:
                t=''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>',tok.group(3),re.S))
                if t:
                    anytext=True; b=('<w:b/>' in tok.group(3) or '<w:b ' in tok.group(3))
                    if not b: allbold=False
                    runs.append(("bold" if b else "text", html.unescape(t), None))
        plain="".join(r[1] for r in runs).strip()
        if plain: paras.append({"full_bold":(allbold and not haslink), "runs":runs, "plain":plain})
    return paras

def split_title(title):
    if ": " in title:
        i=title.index(": "); return title[:i+2], title[i+2:]   # keep the colon+space on part 1
    for sep in [", and ", " and "]:
        if sep in title:
            i=title.index(sep); return title[:i+len(sep)], title[i+len(sep):]
    words=title.split(); k=max(1,len(words)*3//5)
    return " ".join(words[:k])+" ", " ".join(words[k:])

TEMPLATE = io.open(os.path.join(os.path.dirname(__file__),"blog_template.html"),encoding="utf-8").read()

def build():
    posts=[]
    for i,fname in enumerate(ORDER):
        paras=parse(os.path.join(DRAFTS_DIR,fname))
        # drop trailing artifact lines like "."
        paras=[p for p in paras if p["plain"] not in (".","")]
        # skip masthead
        idx=0
        while idx<len(paras) and paras[idx]["full_bold"] and "PRIVATE WEALTH" in paras[idx]["plain"].upper(): idx+=1
        title=paras[idx]["plain"]; idx+=1
        intro=[]; sections=[]; faqs=[]; closing=None; cur=None; mode="intro"
        while idx<len(paras):
            p=paras[idx]; idx+=1
            if p["full_bold"]:
                if p["plain"].lower().startswith("frequently asked"): mode="faq"; continue
                if mode=="faq":
                    ans=[]
                    while idx<len(paras) and not paras[idx]["full_bold"]:
                        ans.append(paras[idx]); idx+=1
                    faqs.append((p["plain"], " ".join(para_html(a["runs"]) for a in ans)))
                    continue
                cur=[]; sections.append([p["plain"], cur]); mode="body"; continue
            hh=para_html(p["runs"])
            if 'href="/#contact"' in hh and closing is None and mode!="faq":
                closing=hh; continue
            (intro if mode=="intro" else cur).append(hh)
        # metadata
        slug=SLUG[fname]; cat=CATEGORY[fname]
        date=FIRST_WED+datetime.timedelta(weeks=i)
        words=sum(len(re.sub("<[^>]+>","",x).split()) for x in intro+[c for _,cc in sections for c in cc]+[f[1] for f in faqs]+([closing] if closing else []))
        read=max(4, round(words/200))
        lead=intro[0] if intro else ""
        body_intro=intro[1:]
        plain_lead=re.sub("<[^>]+>","",lead)
        desc=plain_lead
        if len(desc)>155: desc=desc[:155].rsplit(" ",1)[0]+"."
        desc=desc.replace('"',"'")
        t1,t2=split_title(title)
        # render body
        parts=[]
        for bp in body_intro: parts.append(f"        <p>{bp}</p>")
        for hdg,ps in sections:
            parts.append(f"\n        <h2>{esc(dedash(hdg))}</h2>")
            for pp in ps: parts.append(f"        <p>{pp}</p>")
        body="\n".join(parts)
        faq_html="\n".join(f"          <dt>{esc(dedash(q))}</dt>\n          <dd>{a}</dd>" for q,a in faqs)
        faq_json=",\n".join(
          '      { "@type": "Question", "name": %s, "acceptedAnswer": { "@type": "Answer", "text": %s } }'
          % (json.dumps(dedash(q)), json.dumps(re.sub("<[^>]+>","",a))) for q,a in faqs)
        prev_slug = SLUG[ORDER[i-1]] if i>0 else None
        cont_href = f"/blogs/{prev_slug}" if prev_slug else "/blogs"
        cont_txt  = "Read the previous piece" if prev_slug else "All insights"
        html_out=(TEMPLATE
          .replace("__TITLE_FULL__", esc(title))
          .replace("__TITLE_META__", esc((title[:58]+"…") if len(title)>60 else title))
          .replace("__TITLE1__", esc(t1)).replace("__TITLE2__", esc(t2.strip()))
          .replace("__DESC__", esc(desc))
          .replace("__SLUG__", slug).replace("__CATEGORY__", cat)
          .replace("__DATE__", date.isoformat())
          .replace("__DATE_DISPLAY__", date.strftime("%-d %B %Y"))
          .replace("__READ__", str(read))
          .replace("__LEAD__", lead).replace("__BODY__", body)
          .replace("__FAQ_HTML__", faq_html).replace("__FAQ_JSON__", faq_json)
          .replace("__CLOSING__", closing or "")
          .replace("__CONT_HREF__", cont_href).replace("__CONT_TXT__", cont_txt)
          .replace("__DISCLAIMER__", DISCLAIMER[cat]))
        io.open(os.path.join(OUT_DIR, slug+".html"),"w",encoding="utf-8").write(html_out)
        excerpt=plain_lead
        if len(excerpt)>210: excerpt=excerpt[:210].rsplit(" ",1)[0]+"..."
        title_html=esc(t1)+"<em>"+esc(t2.strip())+"</em>"
        dd=date.strftime("%-d %B %Y")
        listing_card=(
          '        <article class="insight-card insight-card--featured reveal">\n'
          '          <div class="insight-card-meta">\n'
          f'            <span class="insight-category">{cat}</span>\n'
          '            <span class="insight-meta-dot">·</span>\n'
          f'            <time datetime="{date.isoformat()}">{dd}</time>\n'
          '            <span class="insight-meta-dot">·</span>\n'
          f'            <span class="insight-read-time">{read} min read</span>\n'
          '          </div>\n'
          '          <h2 class="insight-title">\n'
          f'            <a href="/blogs/{slug}">{title_html}</a>\n'
          '          </h2>\n'
          f'          <p class="insight-excerpt">{esc(excerpt)}</p>\n'
          f'          <a href="/blogs/{slug}" class="insight-cta">Read the piece <span class="insight-cta-arrow">&rarr;</span></a>\n'
          '        </article>\n')
        sitemap_url=(
          '  <url>\n'
          f'    <loc>https://seleqtwealth.in/blogs/{slug}</loc>\n'
          f'    <lastmod>{date.isoformat()}</lastmod>\n'
          '    <changefreq>monthly</changefreq>\n'
          '    <priority>0.7</priority>\n'
          '  </url>\n')
        posts.append({"slug":slug,"title":title,"category":cat,"date":date.isoformat(),
          "date_display":dd,"read":read,"excerpt":excerpt,"published":False,
          "listing_card":listing_card,"sitemap_url":sitemap_url})
        print(f"  {date} [{cat:12}] {slug}  (sections={len(sections)}, faq={len(faqs)}, {read}min, closing={'y' if closing else 'N'})")
    io.open("scripts/schedule.json","w",encoding="utf-8").write(json.dumps(posts,indent=2,ensure_ascii=False))
    print(f"\nWrote {len(posts)} pages + scripts/schedule.json")

if __name__=="__main__":
    build()
