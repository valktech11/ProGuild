-- FL 25% roof-rule helper — roof age anchor. Idempotent. Staging first.
-- roof_install_date = roof build / last-reroof permit date. Threshold Mar 1, 2009
-- (2007 FBC effective date) drives FBC-EB §706 / FL §553.844(5) eligibility.
-- Date is a proxy; actual 2007-FBC compliance must be verified by permit, not age.
ALTER TABLE roofing_job_data ADD COLUMN IF NOT EXISTS roof_install_date date;
COMMENT ON COLUMN roofing_job_data.roof_install_date IS
  'Roof build/last-reroof permit date — FL 25% rule (FBC-EB §706 / §553.844(5); Mar 1 2009 threshold).';
