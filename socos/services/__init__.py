"""
Abgeleitete Werte werden **gerechnet, nicht gespeichert**: Summen, Auslastung,
Runway, Fortschritt. Sie stehen hier als Funktionen, nicht als Felder.

Die Ausnahme wäre, was ein Beleg ist — ein Wert, der eingefroren gehört, weil
eine spätere Änderung sonst rückwirkend ein Dokument verändert. **In SoCoS gibt
es derzeit keinen solchen Beleg**, weil es keine Abrechnung gibt. Alles wird
gerechnet. Kommt je ein Beleg dazu, wird die Grenze in MEMORY.md neu gezogen.
"""
