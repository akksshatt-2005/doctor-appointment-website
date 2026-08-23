import os
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib.units import inch

def generate_resume(output_pdf_path):
    # Use A4 or Letter (A4 is 595.27 x 841.89 points, standard in India & international)
    # Target 1-page strictly
    doc = SimpleDocTemplate(
        output_pdf_path,
        pagesize=A4,
        leftMargin=34,
        rightMargin=34,
        topMargin=28,
        bottomMargin=28,
        title="Akshat Srivastava - Resume",
        author="Akshat Srivastava"
    )

    story = []
    
    # Palette
    primary_color = colors.HexColor("#0f172a")     # Deep slate / Navy
    accent_color = colors.HexColor("#1d4ed8")      # Professional Sapphire Blue
    text_dark = colors.HexColor("#1e293b")         # Charcoal Dark
    text_muted = colors.HexColor("#475569")        # Slate Gray
    border_color = colors.HexColor("#cbd5e1")      # Soft border

    # Styles
    styles = getSampleStyleSheet()

    name_style = ParagraphStyle(
        'HeaderName',
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=22,
        textColor=primary_color,
        alignment=1 # Center
    )

    contact_style = ParagraphStyle(
        'HeaderContact',
        fontName='Helvetica',
        fontSize=8.8,
        leading=12,
        textColor=text_muted,
        alignment=1 # Center
    )

    section_heading_style = ParagraphStyle(
        'SectionHeading',
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=accent_color,
        spaceBefore=0,
        spaceAfter=0,
        textTransform='uppercase'
    )

    item_title_style = ParagraphStyle(
        'ItemTitle',
        fontName='Helvetica-Bold',
        fontSize=9.3,
        leading=11.5,
        textColor=primary_color
    )

    item_subtitle_style = ParagraphStyle(
        'ItemSubtitle',
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=11,
        textColor=text_muted
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.2,
        textColor=text_dark
    )

    bullet_style = ParagraphStyle(
        'BulletCustom',
        fontName='Helvetica',
        fontSize=8.3,
        leading=10.8,
        textColor=text_dark,
        leftIndent=11,
        firstLineIndent=-11,
        spaceAfter=1.8
    )

    def section_header(title):
        elements = [
            Spacer(1, 4),
            Paragraph(f"<b>{title}</b>", section_heading_style),
            Spacer(1, 1.5),
            HRFlowable(width="100%", thickness=0.8, color=accent_color, spaceBefore=1, spaceAfter=4)
        ]
        return elements

    # 1. HEADER
    story.append(Paragraph("<b>AKSHAT SRIVASTAVA</b>", name_style))
    story.append(Spacer(1, 3))
    
    contacts_html = (
        'Jaipur, Rajasthan, India &nbsp;|&nbsp; '
        '+91 8303449183 &nbsp;|&nbsp; '
        '<a href="mailto:akshatgkp2021@gmail.com" color="#1d4ed8"><u>akshatgkp2021@gmail.com</u></a> &nbsp;|&nbsp; '
        '<a href="https://linkedin.com/in/akshat-srivastava" color="#1d4ed8"><u>LinkedIn</u></a> &nbsp;|&nbsp; '
        '<a href="https://github.com/akksshatt-2005" color="#1d4ed8"><u>GitHub Profile</u></a>'
    )
    story.append(Paragraph(contacts_html, contact_style))
    story.append(Spacer(1, 3))

    # 2. PROFESSIONAL SUMMARY
    for el in section_header("Professional Summary"):
        story.append(el)
    summary_text = (
        "B.Tech Artificial Intelligence & Machine Learning student and Full-Stack Developer with hands-on experience "
        "architecting responsive web platforms, secure RESTful APIs, and relational databases. Skilled in React.js, "
        "Node.js, Express.js, PostgreSQL, and Prisma ORM with solid algorithmic problem-solving in C++ and Python."
    )
    story.append(Paragraph(summary_text, body_style))

    # 3. TECHNICAL SKILLS
    for el in section_header("Technical Skills"):
        story.append(el)
    skills_data = [
        [Paragraph("<b>Languages:</b>", body_style), Paragraph("C, C++, Python, JavaScript (ES6+), SQL, HTML5, CSS3", body_style)],
        [Paragraph("<b>Frontend:</b>", body_style), Paragraph("React.js, Vite, Responsive Web Design, WebSockets (Socket.io-client)", body_style)],
        [Paragraph("<b>Backend & DB:</b>", body_style), Paragraph("Node.js, Express.js, RESTful APIs, JWT Auth, RBAC, PostgreSQL, Prisma ORM, Supabase, Redis", body_style)],
        [Paragraph("<b>Integrations & Tools:</b>", body_style), Paragraph("Razorpay API, Jitsi Meet SDK, Resend/Nodemailer, Git, GitHub, Postman, Linux", body_style)],
        [Paragraph("<b>Core Concepts:</b>", body_style), Paragraph("Data Structures & Algorithms (DSA), Object-Oriented Programming (OOP), DBMS, System Design", body_style)],
    ]
    skills_table = Table(skills_data, colWidths=[92, 439])
    skills_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0.8),
        ('TOPPADDING', (0,0), (-1,-1), 0.8),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(skills_table)

    # 4. PROJECTS
    for el in section_header("Featured Projects"):
        story.append(el)

    # Project 1: Neuro Harmony Clinic
    p1_header_data = [
        [
            Paragraph('<b>Neuro Harmony Clinic – Full-Stack Telehealth Platform</b> | <a href="https://github.com/akksshatt-2005/doctor-appointment-website" color="#1d4ed8"><u>[GitHub Code]</u></a>', item_title_style),
            Paragraph('<b>Dec 2024 – Present</b>', ParagraphStyle('RightDate', parent=item_title_style, alignment=2))
        ]
    ]
    t1 = Table(p1_header_data, colWidths=[420, 111])
    t1.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0.5),
        ('TOPPADDING', (0,0), (-1,-1), 0.5),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t1)
    story.append(Paragraph("<i>Tech Stack: React.js, Node.js, Express.js, PostgreSQL, Prisma ORM, Socket.io, Razorpay API, Jitsi Meet, Redis</i>", item_subtitle_style))
    story.append(Spacer(1, 1.5))
    story.append(Paragraph("• <b>Architecture & Portals:</b> Built a production-ready teleconsultation system with separate Doctor and Patient portals, appointment scheduling, and live status synchronization.", bullet_style))
    story.append(Paragraph("• <b>Payments & Concurrency:</b> Integrated <b>Razorpay API</b> with HMAC-SHA256 signature verification and transactional slot locking to eliminate double-booking conflicts.", bullet_style))
    story.append(Paragraph("• <b>Telehealth & Video Engine:</b> Embedded token-secured <b>Jitsi Meet</b> video consultation rooms with real-time WebSocket queues for live queue updates and alert delivery.", bullet_style))
    story.append(Paragraph("• <b>Prescriptions & Background Jobs:</b> Developed a dynamic digital prescription builder with drug composition auto-search, vitals tracking, PDF generation, and automated SMS/Email alerts via <b>Node-cron & Redis</b>.", bullet_style))

    story.append(Spacer(1, 2.5))

    # Project 2: AI Medical Records Analyzer
    p2_header_data = [
        [
            Paragraph('<b>AI-Powered Medical Records Analyzer & Search</b> | <a href="https://github.com/akksshatt-2005" color="#1d4ed8"><u>[GitHub Code]</u></a>', item_title_style),
            Paragraph('<b>2024</b>', ParagraphStyle('RightDate2', parent=item_title_style, alignment=2))
        ]
    ]
    t2 = Table(p2_header_data, colWidths=[420, 111])
    t2.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0.5),
        ('TOPPADDING', (0,0), (-1,-1), 0.5),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t2)
    story.append(Paragraph("<i>Tech Stack: Python, FastAPI, PostgreSQL, Vector Embeddings, LangChain</i>", item_subtitle_style))
    story.append(Spacer(1, 1.5))
    story.append(Paragraph("• <b>Document Processing:</b> Built an automated clinical report ingestion pipeline extracting key diagnostic indicators and patient history from unstructured medical PDFs.", bullet_style))
    story.append(Paragraph("• <b>API & Search:</b> Designed high-performance asynchronous REST endpoints for semantic similarity retrieval, reducing manual document review time by over 60%.", bullet_style))

    # 5. EXPERIENCE
    for el in section_header("Experience & Leadership"):
        story.append(el)
    exp_header_data = [
        [
            Paragraph('<b>Technical Peer Tutor & Programming Mentor</b> – <i>Department of CS / Freelance</i>', item_title_style),
            Paragraph('<b>2024 – Present</b>', ParagraphStyle('RightDateExp', parent=item_title_style, alignment=2))
        ]
    ]
    t_exp = Table(exp_header_data, colWidths=[420, 111])
    t_exp.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0.5),
        ('TOPPADDING', (0,0), (-1,-1), 0.5),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_exp)
    story.append(Spacer(1, 1.5))
    story.append(Paragraph("• Mentored 30+ students in foundational programming (C/C++), core data structures, and responsive web development (HTML/CSS/JS).", bullet_style))
    story.append(Paragraph("• Conducted interactive code walkthroughs, debugging sessions, and practical lab exercises on Object-Oriented Programming (OOP).", bullet_style))

    # 6. EDUCATION
    for el in section_header("Education"):
        story.append(el)
    
    edu_data = [
        [
            Paragraph("<b>B.Tech in Artificial Intelligence & Machine Learning</b> – JECRC University, Jaipur", body_style),
            Paragraph("<b>Expected 2028</b>", ParagraphStyle('RightEdu1', parent=body_style, alignment=2))
        ],
        [
            Paragraph("<b>Senior Secondary (Class XII, CBSE)</b> – Mount Litera Zee School, Gorakhpur", body_style),
            Paragraph("<b>2024</b>", ParagraphStyle('RightEdu2', parent=body_style, alignment=2))
        ],
        [
            Paragraph("<b>Secondary Education (Class X, CISCE / ICSE)</b> – Little Flower School, Gorakhpur", body_style),
            Paragraph("<b>2022</b>", ParagraphStyle('RightEdu3', parent=body_style, alignment=2))
        ]
    ]
    t_edu = Table(edu_data, colWidths=[420, 111])
    t_edu.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_edu)

    # Build Document
    doc.build(story)
    print(f"Generated PDF at: {output_pdf_path}")

    # Check page count
    pdf_doc = fitz.open(output_pdf_path)
    page_count = len(pdf_doc)
    print(f"Total Page Count: {page_count}")
    
    # Render preview image of page 1
    page = pdf_doc[0]
    pix = page.get_pixmap(dpi=150)
    img_preview_path = output_pdf_path.replace(".pdf", "_preview.png")
    pix.save(img_preview_path)
    print(f"Saved preview image to: {img_preview_path}")
    return page_count, img_preview_path

if __name__ == "__main__":
    output_dir = "/Users/akshatsrivastava/Desktop/neuro harmony clinic/doctor-appointment-website"
    pdf_path = os.path.join(output_dir, "Akshat_Srivastava_Resume.pdf")
    generate_resume(pdf_path)
