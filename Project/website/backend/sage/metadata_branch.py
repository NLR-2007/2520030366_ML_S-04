import pandas as pd, numpy as np, html, re
from catboost import CatBoostClassifier, Pool

TEXT_FIELDS=["title","company_profile","description","requirements","benefits"]
MISSINGNESS_FIELDS=["location","department","salary_range","company_profile","description","requirements","benefits","employment_type","required_experience","required_education","industry","function"]
CATS=["country","location","department","employment_type","required_experience","required_education","industry","function","salary_status"]

def missing_mask(s): return s.fillna("").astype(str).str.strip().eq("")
def clean_plain(s):
    c=s.fillna("").astype(str).map(html.unescape)
    c=c.str.replace(r"<[^>]+>"," ",regex=True)
    c=c.str.replace(r"[\r\n\t]+"," ",regex=True)
    c=c.str.replace(r"\s+"," ",regex=True)
    return c.str.strip()
def parse_salary(v):
    if pd.isna(v): return []
    t=str(v).strip()
    if not t: return []
    out=[]
    for n in re.findall(r"\d[\d,]*(?:\.\d+)?",t):
        try: out.append(float(n.replace(",","")))
        except ValueError: continue
    return out

def build_metadata(d):
    d=d.reset_index(drop=True)
    f=pd.DataFrame(index=d.index)
    for b in ["telecommuting","has_company_logo","has_questions"]:
        f[b]=pd.to_numeric(d[b],errors="coerce").fillna(0).clip(0,1).astype(np.float32)
    mn=[]
    for fld in MISSINGNESS_FIELDS:
        nm=f"{fld}_missing"; f[nm]=missing_mask(d[fld]).astype(np.float32); mn.append(nm)
    f["total_missing_fields"]=f[mn].sum(axis=1).astype(np.float32)
    plain={}
    for fld in TEXT_FIELDS:
        p=clean_plain(d[fld]); plain[fld]=p
        f[f"{fld}_character_count"]=p.str.len().astype(np.float32)
        f[f"{fld}_word_count"]=p.str.count(r"\b\w+\b").astype(np.float32)
        f[f"{fld}_sentence_count"]=p.str.count(r"[.!?]+").astype(np.float32)
    cp=pd.Series("",index=d.index,dtype="object"); cr=pd.Series("",index=d.index,dtype="object")
    for fld in TEXT_FIELDS:
        cp=cp+" "+plain[fld]; cr=cr+" "+d[fld].fillna("").astype(str)
    cp=cp.str.strip(); cl=cp.str.lower()
    f["digit_count"]=cp.str.count(r"\d").astype(np.float32)
    f["uppercase_count"]=cr.map(lambda t:sum(c.isupper() for c in t)).astype(np.float32)
    alpha=cr.map(lambda t:sum(c.isalpha() for c in t)).astype(np.float32)
    f["uppercase_ratio"]=(f["uppercase_count"]/alpha.clip(lower=1)).astype(np.float32)
    f["exclamation_count"]=cr.str.count(r"!").astype(np.float32)
    f["question_mark_count"]=cr.str.count(r"\?").astype(np.float32)
    f["url_count"]=cl.str.count(r"(?:https?://|www\.)").astype(np.float32)
    f["email_count"]=cl.str.count(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b").astype(np.float32)
    f["phone_like_count"]=cp.str.count(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b").astype(np.float32)
    f["money_language"]=cl.str.contains(r"\b(?:earn|earning|income|money|cash|salary|payment|commission|bonus|weekly pay|daily pay|per hour)\b",regex=True).astype(np.float32)
    f["work_from_home_language"]=cl.str.contains(r"\b(?:work from home|work-at-home|home based|remote income)\b",regex=True).astype(np.float32)
    f["no_experience_language"]=cl.str.contains(r"\b(?:no experience|experience not required|no prior experience|without experience)\b",regex=True).astype(np.float32)
    f["whatsapp_telegram"]=cl.str.contains(r"\b(?:whatsapp|telegram)\b",regex=True).astype(np.float32)
    f["excessive_uppercase"]=((f["uppercase_ratio"]>=0.60)&(f["uppercase_count"]>=20)).astype(np.float32)
    sl=d["salary_range"].map(parse_salary)
    smin=sl.map(lambda v:min(v) if len(v)>=2 else 0.0)
    smax=sl.map(lambda v:max(v) if len(v)>=2 else 0.0)
    sw=(smax-smin).clip(lower=0)
    f["salary_minimum_log"]=np.log1p(smin).astype(np.float32)
    f["salary_maximum_log"]=np.log1p(smax).astype(np.float32)
    f["salary_width_log"]=np.log1p(sw).astype(np.float32)
    ss=pd.Series("Provided but unparsed",index=d.index)
    ss.loc[missing_mask(d["salary_range"])]="Missing"
    ss.loc[sl.map(len)>=2]="Valid numeric range"
    loc=d["location"].fillna("").astype(str).str.strip()
    country=loc.str.split(pat=",",n=1,expand=True)[0].str.strip().replace("","Missing")
    cat=pd.DataFrame({"country":country,"location":loc.replace("","Missing"),
        "department":d["department"],"employment_type":d["employment_type"],
        "required_experience":d["required_experience"],"required_education":d["required_education"],
        "industry":d["industry"],"function":d["function"],"salary_status":ss})
    for c in cat.columns:
        cat[c]=cat[c].fillna("Missing").astype(str).str.strip().replace("","Missing")
    return pd.concat([cat,f],axis=1)
