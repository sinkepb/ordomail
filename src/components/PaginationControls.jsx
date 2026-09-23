// Contrôles de pagination génériques pour les listes du backoffice admin
// (22/09/2026, demande titulaire : tous les affichages doivent passer en
// pagination au-delà de 10 éléments) — un seul composant partagé plutôt que
// de dupliquer le même bloc bouton/compteur dans chaque écran admin.
function PaginationControls({ page, setPage, pageCount, totalCount, itemLabel = "élément" }) {
  if (pageCount <= 1) return null;
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:20}}>
      <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}
        style={{padding:"6px 14px",border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:page<=1?"#475569":"#e2e8f0",fontSize:12,cursor:page<=1?"default":"pointer",fontFamily:"inherit"}}>
        ← Précédent
      </button>
      <span style={{fontSize:12,color:"#94a3b8"}}>Page {page} / {pageCount} · {totalCount} {itemLabel}{totalCount>1?"s":""}</span>
      <button onClick={()=>setPage(p=>Math.min(pageCount,p+1))} disabled={page>=pageCount}
        style={{padding:"6px 14px",border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:page>=pageCount?"#475569":"#e2e8f0",fontSize:12,cursor:page>=pageCount?"default":"pointer",fontFamily:"inherit"}}>
        Suivant →
      </button>
    </div>
  );
}

export { PaginationControls };
export default PaginationControls;
